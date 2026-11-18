import fs from 'fs';
import { WebSocket } from 'ws';
import type { AdapterManager } from './adapters/manager';
import type { FileService } from './files';
import type { IpcServer } from './ipc';
import type { MessageQueue, OutputPayload } from './queue';
import type { WorkspaceIdentity } from './workspace';
import type { CliRegistry } from './cliRegistry';
import { routeTerminalMessage } from './terminal-routing';
import { listProjects } from './projects';
import { ControlPolicy } from './control-policy';

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
  controlPolicy?: ControlPolicy;
}

export class RelayClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private sessionRotationTimer: ReturnType<typeof setTimeout> | null = null;
  private session: RelaySessionState | null = null;
  private outputOff: (() => void) | null = null;
  private stopped = true;
  private reconnectAttempts = 0;
  private rotating: Promise<void> | null = null;

  constructor(private options: RelayClientOptions) {}

  async start(): Promise<void> {
    if (!this.stopped) return;
    this.stopped = false;
    this.outputOff = this.options.queue.onOutput((payload) => this.forwardOutput(payload));
    await this.ensureSession();
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.sessionRotationTimer) clearTimeout(this.sessionRotationTimer);
    this.reconnectTimer = null;
    this.sessionRotationTimer = null;
    this.outputOff?.();
    this.outputOff = null;
    this.ws?.close();
    this.ws = null;
  }

  isEnabled(): boolean {
    return Boolean(this.options.internalUrl && this.options.publicUrl);
  }

  getState(): Omit<RelaySessionState, 'agentToken' | 'pairingCode' | 'qrUrl'> | null {
    if (!this.session) return null;
    const { agentToken, pairingCode, qrUrl, ...state } = this.session;
    return state;
  }

  getQrUrl(): string | null {
    return this.session?.qrUrl ?? null;
  }

  async renewPairingQr(): Promise<string | null> {
    const session = this.session;
    if (!session) return null;
    const response = await fetch(`${this.options.internalUrl.replace(/\/$/, '')}/api/relay/pairing-code`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.agentToken}` },
      signal: AbortSignal.timeout(2_000),
    });
    if (!response.ok || this.session?.sessionId !== session.sessionId) return null;
    const { pairingCode, qrUrl } = await response.json() as { pairingCode: string; qrUrl: string };
    if (this.session?.sessionId !== session.sessionId) return null;
    this.session = { ...this.session, pairingCode, qrUrl };
    this.persistSession(this.session);
    return qrUrl;
  }

  async applyOnboardingSetup(setupToken: string): Promise<void> {
    if (!this.isEnabled()) throw new Error('relay is disabled');
    const res = await fetch(`${this.options.internalUrl.replace(/\/$/, '')}/api/onboarding/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5_000),
      body: JSON.stringify({
        setupToken,
        label: this.options.sessionLabel,
        workspaceId: this.options.workspace.id,
        workspaceFolders: this.options.workspaceFolders,
      }),
    });
    if (!res.ok) throw new Error(`onboarding claim failed (${res.status})`);
    const data = await res.json() as ClaimOnboardingSessionResponse;
    const socket = this.ws;
    this.ws = null;
    socket?.close();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.installSession(data);
    this.connect();
  }

  async refreshSessionState(): Promise<void> {
    if (!this.session) return;
    if (this.session.expiresAt <= Date.now()) {
      await this.rotateSession('session expired locally');
      return;
    }
    const current = this.session;
    try {
      const res = await fetch(`${this.options.internalUrl.replace(/\/$/, '')}/api/relay/sessions/${current.sessionId}`, {
        headers: { Authorization: `Bearer ${current.agentToken}` },
        signal: AbortSignal.timeout(5_000),
      });
      if (this.session?.sessionId !== current.sessionId) return;
      if (res.status === 401 || res.status === 403 || res.status === 404) {
        await this.rotateSession(`session rejected by relay (${res.status})`);
        return;
      }
      if (!res.ok) return;
      const data = await res.json() as SessionStatusResponse;
      if (this.session?.sessionId !== current.sessionId) return;
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
    if (!this.session?.connected || this.ws?.readyState !== WebSocket.OPEN) return;
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
        control: (this.options.controlPolicy ?? new ControlPolicy()).describe(),
        timestamp: Date.now(),
      },
    });
  }

  private async ensureSession(): Promise<void> {
    if (!this.isEnabled() || this.stopped || this.session) return;
    const restored = await this.restorePersistedSession();
    if (this.stopped || this.session) return;
    if (restored) {
      this.session = restored;
      this.options.ipc.setRelayQrUrl?.(restored.qrUrl ?? null);
      this.scheduleSessionRotation();
      console.log(`[Relay] Restored session: ${restored.sessionId}`);
      return;
    }

    try {
      const res = await fetch(`${this.options.internalUrl.replace(/\/$/, '')}/api/relay/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5_000),
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
      if (this.stopped || this.session) return;
      this.installSession(data);
      console.log(`[Relay] Session created: ${data.sessionId}`);
    } catch (err) {
      console.warn(`[Relay] ensureSession error — will retry in 15s:`, err);
      this.scheduleSessionRetry();
    }
  }

  private installSession(data: CreateSessionResponse): void {
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
  }

  private scheduleSessionRetry(delayMs = 15_000): void {
    if (this.stopped || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.ensureSession().then(() => {
        if (this.session) this.connect();
      });
    }, delayMs);
  }

  private scheduleSessionRotation(): void {
    if (this.sessionRotationTimer) clearTimeout(this.sessionRotationTimer);
    if (!this.session || this.stopped) return;
    const rotateInMs = Math.max(this.session.expiresAt - Date.now(), 1_000);
    this.sessionRotationTimer = setTimeout(() => {
      this.sessionRotationTimer = null;
      void this.rotateSession('session nearing expiry');
    }, rotateInMs);
  }

  private rotateSession(reason: string): Promise<void> {
    if (this.stopped) return Promise.resolve();
    if (!this.rotating) {
      this.rotating = this.replaceSession(reason).finally(() => { this.rotating = null; });
    }
    return this.rotating;
  }

  private async replaceSession(reason: string): Promise<void> {
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

    let status: SessionStatusResponse | null = null;
    try {
      const res = await fetch(`${this.options.internalUrl.replace(/\/$/, '')}/api/relay/sessions/${persisted.sessionId}`, {
        headers: { Authorization: `Bearer ${persisted.agentToken}` },
        signal: AbortSignal.timeout(5_000),
      });
      if ([401, 403, 404].includes(res.status)) {
        this.clearPersistedSession();
        return null;
      }
      if (res.ok) status = await res.json() as SessionStatusResponse;
    } catch {
      // Keep the stored session during a temporary network outage.
    }
    return {
      enabled: true,
      relayUrl: persisted.relayUrl,
      sessionId: persisted.sessionId,
      pairingCode: persisted.pairingCode,
      qrUrl: persisted.qrUrl,
      agentToken: persisted.agentToken,
      expiresAt: persisted.expiresAt,
      status: status?.status ?? 'waiting',
      agentConnected: false,
      mobileConnected: status?.mobileConnected ?? false,
      connected: false,
      lastError: null,
    };
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
      const sessionFile = this.options.workspace.sessionFilePath;
      const temporaryFile = `${sessionFile}.${process.pid}.tmp`;
      fs.writeFileSync(temporaryFile, JSON.stringify({
        workspaceId: this.options.workspace.id,
        relayUrl: session.relayUrl,
        sessionId: session.sessionId,
        pairingCode: session.pairingCode,
        qrUrl: session.qrUrl,
        agentToken: session.agentToken,
        expiresAt: session.expiresAt,
      } satisfies PersistedRelaySession, null, 2), { mode: 0o600 });
      fs.chmodSync(temporaryFile, 0o600);
      fs.renameSync(temporaryFile, sessionFile);
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
    const session = this.session;
    if (!session || this.stopped || this.ws) return;
    const wsUrl = session.relayUrl.replace(/^https/, 'wss').replace(/^http/, 'ws').replace(/\/$/, '') + '/ws';
    const socket = new WebSocket(wsUrl, { handshakeTimeout: 5_000, maxPayload: 32 * 1024 * 1024 });
    this.ws = socket;
    const deadline = setTimeout(() => socket.terminate(), 10_000);
    let heartbeat: NodeJS.Timeout;
    const armHeartbeat = () => {
      clearTimeout(heartbeat);
      heartbeat = setTimeout(() => socket.terminate(), 55_000);
    };
    socket.on('ping', armHeartbeat);
    socket.on('open', () => {
      if (this.ws !== socket) return;
      armHeartbeat();
      socket.send(JSON.stringify({ type: 'auth', token: session.agentToken }));
    });

    socket.on('message', (raw) => {
      if (this.ws !== socket) return;
      try {
        const msg = JSON.parse(raw.toString()) as Record<string, unknown>;
        if (!msg || typeof msg !== 'object' || Array.isArray(msg) || typeof msg.type !== 'string') return;
        if (msg.type === 'auth_ok') {
          clearTimeout(deadline);
          this.reconnectAttempts = 0;
        }
        void this.handleMessage(msg, socket).catch((error: unknown) => this.setError(error));
      } catch {
        // Ignore malformed relay frames.
      }
    });

    socket.on('close', (code) => {
      clearTimeout(deadline);
      clearTimeout(heartbeat);
      if (this.ws !== socket) return;
      this.ws = null;
      if (this.session) {
        this.session = { ...this.session, connected: false, agentConnected: false };
      }
      if (code === 4401 || code === 4404) void this.rotateSession(`credential rejected (${code})`);
      else if (code === 4410) this.setError(new Error('workspace connection replaced'));
      else this.scheduleReconnect();
    });

    socket.on('error', (err) => {
      if (this.ws === socket) this.setError(err);
    });
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer || !this.session) return;
    const delay = Math.min(1_000 * 2 ** this.reconnectAttempts++, 30_000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay * (0.75 + Math.random() * 0.25));
  }

  private async handleMessage(msg: Record<string, unknown>, socket: WebSocket): Promise<void> {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'auth_ok') {
      if (!this.session || msg.role !== 'agent' || msg.sessionId !== this.session.sessionId) return;
      this.session = { ...this.session, connected: true, agentConnected: true, lastError: null };
      this.persistSession(this.session);
      this.send('agent_hello', {
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
    if (!this.session?.connected) return;
    if (msg.source === 'mobile') {
      if (msg.sessionId !== this.session.sessionId || msg.workspaceId !== this.options.workspace.id) return;
      const params = msg.payload && typeof msg.payload === 'object' && !Array.isArray(msg.payload)
        ? msg.payload as Record<string, unknown> : {};
      let ok = false;
      try {
        ok = await this.dispatchMobileCommand({ ...params, type, text: msg.text, tool: msg.tool, target: msg.target });
      } catch (error) {
        this.setError(error);
      }
      if (this.ws === socket && typeof msg.request_id === 'string') {
        this.send('relay_command_ack', { request_id: msg.request_id, ok });
      }
      return;
    }

    if (msg.workspace_id !== this.options.workspace.id) return;
    if (type === 'relay_clis_request' && typeof msg.request_id === 'string') {
      const action = String(msg.action ?? '');
      const registry = this.options.cliRegistry;
      const respond = (payload: Record<string, unknown>) => {
        if (this.ws === socket) this.send('relay_clis_response', { request_id: msg.request_id, ...payload });
      };
      if (!registry) {
        respond({ error: 'no registry', clis: [] });
        return;
      }
      if (action !== 'list' && action !== 'detect') {
        respond({ error: 'CLI configuration is only allowed on the host', ok: false });
        return;
      }
      if (action === 'list') {
        respond({ clis: registry.getAll() });
      } else if (action === 'detect') {
        try {
          await registry.detectAll();
          respond({ clis: registry.getAll() });
        } catch {
          respond({ error: 'CLI detection failed' });
        }
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

  }

  private async dispatchMobileCommand(msg: Record<string, unknown>): Promise<boolean> {
    const { adapters, ipc, cliRegistry, workspace } = this.options;
    const decision = (this.options.controlPolicy ?? new ControlPolicy()).authorize(String(msg.type ?? ''), msg);
    if (!decision.allowed) {
      this.send('action_rejected', { action: String(msg.type ?? ''), reason: decision.reason });
      return false;
    }
    switch (msg.type) {
      case 'chat':
      case 'message': {
        if (typeof msg.text !== 'string' || !msg.text.trim()) return false;
        const target = typeof msg.target === 'string' ? msg.target : undefined;
        const tool = typeof msg.tool === 'string' ? msg.tool : undefined;
        const routed = routeTerminalMessage(ipc, cliRegistry, msg.text, target, msg.sendEnter !== false);
        return routed?.queued ?? adapters.send({ text: msg.text, tool, target });
      }
      case 'adapter_toggle':
        if (typeof msg.id !== 'string') return false;
        adapters.setActive(msg.id);
        this.send('event', { event: `active_adapter:${msg.id}` });
        void this.sendStatusSnapshot();
        return true;
      case 'notif_response': {
        if (typeof msg.id !== 'string' || (msg.action !== 'validate' && msg.action !== 'refuse')) return false;
        const note = `Mobile user ${msg.action === 'validate' ? 'approved' : 'rejected'} request ${msg.id}`;
        return adapters.send({ text: note });
      }
      case 'action':
        if (typeof msg.action !== 'string') return false;
        await adapters.runAction(msg.action, Array.isArray(msg.args) ? msg.args.map(String) : []);
        return true;
      case 'open_project': {
        const projectPath = msg.projectPath ?? msg.path;
        const projects = ipc.getProjects();
        const available = projects.length ? projects : listProjects(workspace.path).projects;
        if (typeof projectPath !== 'string' || !available.some(project => project.path === projectPath)) return false;
        return ipc.sendToExtension({ type: 'open_project', projectPath, newWindow: msg.newWindow === true });
      }
      case 'list_projects': {
        const projects = ipc.getProjects();
        const listing = projects.length ? { projects, parentDir: ipc.getProjectsParentDir() } : listProjects(workspace.path);
        this.send('projects_list', { payload: listing });
        return true;
      }
      case 'get_preview_url':
        this.send('dev_server_url', { url: adapters.getPreviewUrl() ?? ipc.getPreviewUrl() });
        return true;
      case 'get_pairing_code':
        this.send('relay_session', { payload: this.getState() });
        return true;
      case 'focus_terminal':
      case 'kill_cli':
        return typeof msg.terminalName === 'string' && ipc.sendToExtension({ type: msg.type, terminalName: msg.terminalName });
      case 'create_terminal':
        return ipc.sendToExtension({ type: msg.type, terminalName: String(msg.terminalName ?? '').trim() || 'DevBridge 1' });
      case 'start_cli': {
        const cli = typeof msg.cliId === 'string' ? cliRegistry?.getById(msg.cliId) : undefined;
        return !!cli && ipc.sendToExtension({
          type: 'start_cli', cliId: cli.id, command: cli.command, args: cli.args,
          terminalName: cliRegistry?.getTerminalName(cli.id) ?? `DevBridge ${cli.name}`,
        });
      }
      default:
        return false;
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
