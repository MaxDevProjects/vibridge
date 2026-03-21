import fs from 'fs';
import { WebSocket } from 'ws';
import type { AdapterManager } from './adapters/manager';
import type { FileService } from './files';
import type { IpcServer } from './ipc';
import type { MessageQueue, OutputPayload } from './queue';
import type { WorkspaceIdentity } from './workspace';
import type { CliRegistry } from './cliRegistry';
import { listProjects } from './projects';

interface RelaySessionState {
  enabled: boolean;
  relayUrl: string;
  sessionId: string;
  pairingCode: string;
  qrUrl: string;
  agentToken: string;
  expiresAt: number;
  status: 'waiting' | 'paired' | 'closed';
  agentConnected: boolean;
  mobileConnected: boolean;
  connected: boolean;
  lastError: string | null;
}

interface CreateSessionResponse {
  sessionId: string;
  pairingCode: string;
  agentToken: string;
  expiresAt: number;
  relayUrl: string;
  qrUrl: string;
}

interface ClaimOnboardingSessionResponse extends CreateSessionResponse {}

interface SessionStatusResponse {
  id: string;
  status: 'waiting' | 'paired' | 'closed';
  expiresAt: number;
  agentConnected: boolean;
  mobileConnected: boolean;
}

interface PersistedRelaySession {
  workspaceId: string;
  relayUrl: string;
  sessionId: string;
  pairingCode: string;
  qrUrl: string;
  agentToken: string;
  expiresAt: number;
}

interface RelayClientOptions {
  internalUrl: string;
  publicUrl: string;
  sessionLabel: string;
  workspaceFolders: string[];
  workspace: WorkspaceIdentity;
  adapters: AdapterManager;
  files: FileService;
  ipc: IpcServer;
  queue: MessageQueue;
  cliRegistry?: CliRegistry;
}

export class RelayClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private sessionRotationTimer: ReturnType<typeof setTimeout> | null = null;
  private session: RelaySessionState | null = null;
  private outputOff: (() => void) | null = null;
  private pendingSetupToken: string | null = null;

  constructor(private options: RelayClientOptions) {}

  async start(): Promise<void> {
    this.outputOff = this.options.queue.onOutput((payload) => this.forwardOutput(payload));
    await this.ensureSession();
    this.connect();
  }

  stop(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.sessionRotationTimer) clearTimeout(this.sessionRotationTimer);
    this.outputOff?.();
    this.outputOff = null;
    this.ws?.close();
    this.ws = null;
  }

  isEnabled(): boolean {
    return Boolean(this.options.internalUrl && this.options.publicUrl);
  }

  getState(): RelaySessionState | null {
    return this.session ? { ...this.session } : null;
  }

  async applyOnboardingSetup(setupToken: string): Promise<void> {
    const normalized = setupToken.trim();
    if (!normalized) return;
    this.pendingSetupToken = normalized;
    if (this.session) {
      await this.rotateSession('onboarding setup applied');
      return;
    }
    await this.ensureSession();
    if (this.session) this.connect();
  }

  async refreshSessionState(): Promise<void> {
    if (!this.session) return;
    if (this.session.expiresAt <= Date.now()) {
      await this.rotateSession('session expired locally');
      return;
    }
    try {
      const res = await fetch(`${this.options.internalUrl.replace(/\/$/, '')}/api/relay/sessions/${this.session.sessionId}`, {
        headers: { Authorization: `Bearer ${this.session.agentToken}` },
      });
      if (res.status === 401 || res.status === 403 || res.status === 404) {
        await this.rotateSession(`session rejected by relay (${res.status})`);
        return;
      }
      if (!res.ok) return;
      const data = await res.json() as SessionStatusResponse;
      this.session = {
        ...this.session,
        status: data.status,
        agentConnected: data.agentConnected,
        mobileConnected: data.mobileConnected,
      };
    } catch (err) {
      this.setError(err);
    }
  }

  send(type: string, payload: Record<string, unknown> = {}): void {
    if (!this.session || this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type, ...payload }));
  }

  async sendStatusSnapshot(): Promise<void> {
    if (!this.session) return;
    await this.refreshSessionState();
    const ideState = this.options.ipc.getIdeState();
    const workspaceFolders = Array.isArray(ideState?.workspaceFolders) ? ideState.workspaceFolders as string[] : [];
    const firstFolder = workspaceFolders.length ? String(workspaceFolders[0] ?? '') : '';
    // Use the VS Code workspace folder as tree root when available
    const fileTreeNode = firstFolder
      ? this.options.files.treeFrom(firstFolder)
      : this.options.files.tree();
    this.send('status_snapshot', {
      payload: {
        ok: true,
        adapters: this.options.adapters.list(),
        activeAdapter: this.options.adapters.active(),
        ideState,
        previewUrl: this.options.adapters.getPreviewUrl(),
        fileTree: fileTreeNode.children ?? [],
        relay: this.getState(),
        timestamp: Date.now(),
      },
    });
  }

  private async ensureSession(): Promise<void> {
    if (!this.isEnabled()) return;
    const restored = await this.restorePersistedSession();
    if (restored) {
      this.session = restored;
      this.options.ipc.setRelayQrUrl?.(restored.qrUrl ?? null);
      this.scheduleSessionRotation();
      console.log(`[Relay] Restored session: ${restored.sessionId}`);
      return;
    }

    if (this.pendingSetupToken) {
      try {
        const res = await fetch(`${this.options.internalUrl.replace(/\/$/, '')}/api/onboarding/claim`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            setupToken: this.pendingSetupToken,
            label: this.options.sessionLabel,
            workspaceId: this.options.workspace.id,
            workspaceFolders: this.options.workspaceFolders,
          }),
        });
        if (res.ok) {
          const data = await res.json() as ClaimOnboardingSessionResponse;
          this.session = {
            enabled: true,
            relayUrl: data.relayUrl,
            sessionId: data.sessionId,
            pairingCode: data.pairingCode,
            qrUrl: data.qrUrl,
            agentToken: data.agentToken,
            expiresAt: data.expiresAt,
            status: 'waiting',
            agentConnected: false,
            mobileConnected: false,
            connected: false,
            lastError: null,
          };
          this.pendingSetupToken = null;
          this.options.ipc.setRelayQrUrl?.(this.session.qrUrl ?? null);
          this.persistSession(this.session);
          this.scheduleSessionRotation();
          console.log(`[Relay] Claimed onboarding session: ${this.session.sessionId}`);
          return;
        }
        const body = await res.text().catch(() => '');
        console.warn(`[Relay] Onboarding claim failed (${res.status}) — falling back to new session. ${body}`);
      } catch (err) {
        console.warn('[Relay] Onboarding claim error — falling back to new session:', err);
      }
    }

    try {
      const res = await fetch(`${this.options.internalUrl.replace(/\/$/, '')}/api/relay/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: this.options.sessionLabel,
          workspaceId: this.options.workspace.id,
          workspaceFolders: this.options.workspaceFolders,
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.warn(`[Relay] Session creation failed (${res.status}) — will retry. ${body}`);
        this.scheduleSessionRetry();
        return;
      }
      const data = await res.json() as CreateSessionResponse;
      this.session = {
        enabled: true,
        relayUrl: data.relayUrl,
        sessionId: data.sessionId,
        pairingCode: data.pairingCode,
        qrUrl: data.qrUrl,
        agentToken: data.agentToken,
        expiresAt: data.expiresAt,
        status: 'waiting',
        agentConnected: false,
        mobileConnected: false,
        connected: false,
        lastError: null,
      };
      this.options.ipc.setRelayQrUrl?.(this.session.qrUrl ?? null);
      this.persistSession(this.session);
      this.scheduleSessionRotation();
      console.log(`[Relay] Session created: ${this.session.sessionId}`);
    } catch (err) {
      console.warn(`[Relay] ensureSession error — will retry in 15s:`, err);
      this.scheduleSessionRetry();
    }
  }

  private scheduleSessionRetry(delayMs = 15_000): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.ensureSession().then(() => {
        if (this.session) this.connect();
      });
    }, delayMs);
  }

  private scheduleSessionRotation(): void {
    if (this.sessionRotationTimer) clearTimeout(this.sessionRotationTimer);
    if (!this.session) return;
    const rotateInMs = Math.max(this.session.expiresAt - Date.now() - 60_000, 1_000);
    this.sessionRotationTimer = setTimeout(() => {
      this.sessionRotationTimer = null;
      void this.rotateSession('session nearing expiry');
    }, rotateInMs);
  }

  private async rotateSession(reason: string): Promise<void> {
    console.warn(`[Relay] Rotating session — ${reason}`);
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.sessionRotationTimer) {
      clearTimeout(this.sessionRotationTimer);
      this.sessionRotationTimer = null;
    }
    const socket = this.ws;
    this.ws = null;
    this.session = null;
    socket?.close();
    this.options.ipc.setRelayQrUrl?.(null);
    this.clearPersistedSession();
    await this.ensureSession();
    if (this.session) this.connect();
  }

  private async restorePersistedSession(): Promise<RelaySessionState | null> {
    const persisted = this.readPersistedSession();
    if (!persisted) return null;
    if (persisted.workspaceId !== this.options.workspace.id) {
      this.clearPersistedSession();
      return null;
    }
    if (persisted.expiresAt <= Date.now()) {
      this.clearPersistedSession();
      return null;
    }

    try {
      const res = await fetch(`${this.options.internalUrl.replace(/\/$/, '')}/api/relay/sessions/${persisted.sessionId}`, {
        headers: { Authorization: `Bearer ${persisted.agentToken}` },
      });
      if (!res.ok) {
        this.clearPersistedSession();
        return null;
      }
      const data = await res.json() as SessionStatusResponse;
      const restored: RelaySessionState = {
        enabled: true,
        relayUrl: persisted.relayUrl,
        sessionId: persisted.sessionId,
        pairingCode: persisted.pairingCode,
        qrUrl: persisted.qrUrl,
        agentToken: persisted.agentToken,
        expiresAt: persisted.expiresAt,
        status: data.status,
        agentConnected: data.agentConnected,
        mobileConnected: data.mobileConnected,
        connected: false,
        lastError: null,
      };
      this.persistSession(restored);
      return restored;
    } catch {
      return null;
    }
  }

  private readPersistedSession(): PersistedRelaySession | null {
    try {
      if (!fs.existsSync(this.options.workspace.sessionFilePath)) return null;
      const raw = fs.readFileSync(this.options.workspace.sessionFilePath, 'utf8');
      if (!raw.trim()) return null;
      const parsed = JSON.parse(raw) as Partial<PersistedRelaySession>;
      if (
        typeof parsed.workspaceId !== 'string'
        || typeof parsed.relayUrl !== 'string'
        || typeof parsed.sessionId !== 'string'
        || typeof parsed.pairingCode !== 'string'
        || typeof parsed.qrUrl !== 'string'
        || typeof parsed.agentToken !== 'string'
        || typeof parsed.expiresAt !== 'number'
      ) {
        return null;
      }
      return {
        workspaceId: parsed.workspaceId,
        relayUrl: parsed.relayUrl,
        sessionId: parsed.sessionId,
        pairingCode: parsed.pairingCode,
        qrUrl: parsed.qrUrl,
        agentToken: parsed.agentToken,
        expiresAt: parsed.expiresAt,
      };
    } catch {
      return null;
    }
  }

  private persistSession(session: RelaySessionState): void {
    try {
      fs.writeFileSync(this.options.workspace.sessionFilePath, JSON.stringify({
        workspaceId: this.options.workspace.id,
        relayUrl: session.relayUrl,
        sessionId: session.sessionId,
        pairingCode: session.pairingCode,
        qrUrl: session.qrUrl,
        agentToken: session.agentToken,
        expiresAt: session.expiresAt,
      } satisfies PersistedRelaySession, null, 2));
    } catch (err) {
      console.warn('[Relay] Failed to persist session:', err);
    }
  }

  private clearPersistedSession(): void {
    try {
      if (fs.existsSync(this.options.workspace.sessionFilePath)) {
        fs.unlinkSync(this.options.workspace.sessionFilePath);
      }
    } catch (err) {
      console.warn('[Relay] Failed to clear persisted session:', err);
    }
  }

  private connect(): void {
    if (!this.session) return;
    const wsUrl = this.session.relayUrl.replace(/^https/, 'wss').replace(/^http/, 'ws').replace(/\/$/, '') + '/ws';
    this.ws = new WebSocket(wsUrl);

    this.ws.on('open', () => {
      if (!this.session || !this.ws) return;
      this.ws.send(JSON.stringify({ type: 'auth', token: this.session.agentToken }));
    });

    this.ws.on('message', (raw) => {
      try {
        this.handleMessage(JSON.parse(raw.toString()) as Record<string, unknown>);
      } catch {
        // ignore malformed relay frames
      }
    });

    this.ws.on('close', () => {
      if (this.session) {
        this.session = { ...this.session, connected: false, agentConnected: false };
      }
      this.scheduleReconnect();
    });

    this.ws.on('error', (err) => {
      this.setError(err);
      this.ws?.close();
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || !this.session) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 2_000);
  }

  private handleMessage(msg: Record<string, unknown>): void {
    if (msg.type === 'auth_ok') {
      if (!this.session) return;
      this.session = { ...this.session, connected: true, agentConnected: true, lastError: null };
      this.persistSession(this.session);
      this.send('agent_hello', {
        token: this.session.agentToken,
        workspace_id: this.options.workspace.id,
        workspace_name: this.options.workspace.name,
        workspace_path: this.options.workspace.path,
      });
      void this.sendStatusSnapshot();
      return;
    }

    if (msg.type === 'peer_status') {
      if (!this.session) return;
      this.session = {
        ...this.session,
        agentConnected: Boolean(msg.agentConnected),
        mobileConnected: Boolean(msg.mobileConnected),
      };
      this.persistSession(this.session);
      return;
    }

    const type = String(msg.type ?? '');
    if (!type) return;

    if (type === 'chat' || type === 'message') {
      this.options.adapters.send({
        text: String(msg.text ?? ''),
        tool: typeof msg.tool === 'string' ? msg.tool : undefined,
        target: typeof msg.target === 'string' ? msg.target : undefined,
      });
      return;
    }

    if (type === 'adapter_toggle' && msg.id) {
      this.options.adapters.setActive(String(msg.id));
      this.send('event', { event: `active_adapter:${String(msg.id)}` });
      void this.sendStatusSnapshot();
      return;
    }

    if (type === 'notif_response') {
      const action = msg.action === 'validate' ? 'approved' : 'rejected';
      const note = `Mobile user ${action} request ${String(msg.id ?? '')}`.trim();
      this.options.adapters.send({ text: note });
      this.send('event', { event: note });
      return;
    }

    if (type === 'action' && typeof msg.action === 'string') {
      void this.options.adapters.runAction(msg.action, Array.isArray(msg.args) ? msg.args.map(String) : []);
      return;
    }

    if (type === 'open_project') {
      const payload = typeof msg.payload === 'object' && msg.payload ? msg.payload as Record<string, unknown> : {};
      this.options.ipc.sendToExtension({
        type: 'open_project',
        projectPath: typeof msg.path === 'string' ? msg.path : typeof payload.projectPath === 'string' ? payload.projectPath : undefined,
        newWindow: msg.newWindow === true || payload.newWindow === true,
      });
      return;
    }

    if (type === 'list_projects') {
      const listing = listProjects(this.options.workspace.path);
      this.send('projects_list', {
        payload: {
          projects: listing.projects,
          parentDir: listing.parentDir,
        },
      });
      return;
    }

    if (type === 'get_preview_url') {
      this.send('dev_server_url', { url: this.options.adapters.getPreviewUrl() });
      return;
    }

    if (type === 'get_pairing_code') {
      if (!this.session) return;
      this.send('relay_session', { payload: this.getState() });
      return;
    }

    if (type === 'relay_clis_request' && typeof msg.request_id === 'string') {
      const action = String(msg.action ?? '');
      const registry = this.options.cliRegistry;
      const respond = (payload: Record<string, unknown>) => {
        this.send('relay_clis_response', { request_id: msg.request_id, ...payload });
      };
      if (!registry) {
        respond({ error: 'no registry', clis: [] });
        return;
      }
      if (action === 'list') {
        respond({ clis: registry.getAll() });
      } else if (action === 'detect') {
        void registry.detectAll().then(() => respond({ clis: registry.getAll() }));
      } else if (action === 'set_default') {
        const ok = registry.setDefault(String(msg.id ?? ''));
        respond({ ok, clis: registry.getAll() });
      } else if (action === 'add_custom') {
        const cli = registry.addCustom({
          name: String(msg.name ?? ''),
          command: String(msg.command ?? ''),
          args: Array.isArray(msg.args) ? msg.args.map(String) : undefined,
        });
        respond({ ok: true, cli, clis: registry.getAll() });
      } else if (action === 'remove_custom') {
        const ok = registry.removeCustom(String(msg.id ?? ''));
        respond({ ok });
      } else {
        respond({ error: 'unknown action' });
      }
      return;
    }

    if (type === 'relay_file_request' && typeof msg.request_id === 'string') {
      const filePath = typeof msg.path === 'string' ? msg.path : '';
      const ideState = this.options.ipc.getIdeState();
      const workspaceFolders = Array.isArray(ideState?.workspaceFolders) ? ideState.workspaceFolders as string[] : [];
      const firstFolder = workspaceFolders.length ? String(workspaceFolders[0] ?? '') : '';
      const content = this.options.files.read(filePath, firstFolder || undefined);
      this.send('relay_file_response', {
        request_id: msg.request_id,
        path: filePath,
        ...(content === null ? { error: 'not found' } : { content }),
      });
      return;
    }

    if (type === 'focus_terminal') {
      const payload = typeof msg.payload === 'object' && msg.payload ? msg.payload as Record<string, unknown> : {};
      this.options.ipc.sendToExtension({
        type: 'focus_terminal',
        terminalName: String(msg.terminalName ?? payload.terminalName ?? ''),
      });
      return;
    }

    if (type === 'create_terminal') {
      const payload = typeof msg.payload === 'object' && msg.payload ? msg.payload as Record<string, unknown> : {};
      const terminalName = String(msg.terminalName ?? payload.terminalName ?? '').trim() || 'DevBridge 1';
      this.options.ipc.sendToExtension({ type: 'create_terminal', terminalName });
      return;
    }

    if (type === 'start_cli') {
      const cliId = String(msg.cliId ?? '');
      const cli = this.options.cliRegistry?.getById(cliId);
      if (cli) {
        this.options.ipc.sendToExtension({
          type: 'start_cli',
          cliId: cli.id,
          command: cli.command,
          args: cli.args,
          terminalName: `DevBridge ${cli.name}`,
        });
      }
      return;
    }

    if (type === 'kill_cli') {
      this.options.ipc.sendToExtension({
        type: 'kill_cli',
        terminalName: String(msg.terminalName ?? ''),
      });
      return;
    }
  }

  private forwardOutput(payload: OutputPayload): void {
    this.send(String(payload.type ?? 'output'), {
      text: payload.text,
      tool: payload.tool,
      payload: payload.data,
      isQuestion: payload.isQuestion,
    });
  }

  private setError(err: unknown): void {
    if (!this.session) return;
    this.session = { ...this.session, lastError: err instanceof Error ? err.message : String(err) };
  }
}
