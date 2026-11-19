import { timingSafeEqual } from 'crypto';
/**
 * DevBridge Agent — IPC server
 * Listens on a Unix socket (local/Docker) and optionally on a TCP port (remote/WSL).
 */
import net from 'net';
import fs from 'fs';
import path from 'path';
import type { AdapterManager } from './adapters/manager';
import type { MessageQueue, OutputPayload } from './queue';
import type { PushService } from './push';
import type { AuthService } from './auth';
import type { CliRegistry } from './cliRegistry';
import { ActivityEngine, type ActivitySnapshot } from './activity/engine';

// Matches http://localhost:PORT or http://127.0.0.1:PORT with optional path, ignoring ANSI.
const DEV_SERVER_URL_RE = /https?:\/\/(?:localhost|127\.0\.0\.1)(:\d+)?(?:\/[^\s\x1b]*)*/;

export class IpcServer {
  private server: net.Server;
  private activeExtension: net.Socket | null = null;
  private windowSockets = new Map<string, net.Socket>();
  private windowCleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private socketWindows = new Map<net.Socket, string>();
  private windowStates = new Map<string, {
    id: string; connected: boolean; ideState: Record<string, unknown> | null;
    projects: Array<{ name: string; path: string; isActive: boolean }>;
    parentDir: string; lastSeen: number;
    activity?: { state: 'running' | 'finished' | 'attention_possible'; terminalId?: string; updatedAt: number };
  }>();
  private adapterOwners = new Map<string, net.Socket>();
  private tcpServer: net.Server | null = null;
  private clients = new Set<net.Socket>();
  private ideState: Record<string, unknown> | null = null;
  private previewUrl: string | null = null;
  private terminalQuestionState = new Map<string, { text: string; notifiedAt: number; candidateSince: number; hits: number }>();
  private relayQrUrl: string | null = null;
  private projects: Array<{ name: string; path: string; isActive: boolean }> = [];
  private projectsParentDir = '';
  broadcast?: (data: unknown) => void;
  forward?: (type: string, payload?: Record<string, unknown>) => void;
  private readonly activity = new ActivityEngine(update => {
    this.broadcast?.({ type:'activity_update', ...update });
    this.forward?.('activity_update', { ...update });
  });

  getActivitySnapshot(): ActivitySnapshot[] {
    return this.activity.snapshot();
  }

  constructor(
    private socketPath: string,
    private adapters: AdapterManager,
    private queue: MessageQueue,
    private push: PushService,
    private auth: AuthService,
    private workspaceId = 'workspace',
    private getRelaySessionId: () => string | null = () => null,
    private cliRegistry?: CliRegistry,
    private applyRelaySetup?: (setupToken: string) => void | Promise<void>,
    private renewRelayQr?: () => Promise<string | null>,
  ) {
    this.server = net.createServer((socket) => this.handleClient(socket));
  }

  async listen(tcpPort?: number, unixSocket = true): Promise<void> {
    // Remove stale socket file if it exists
    const dir = path.dirname(this.socketPath);
    const tcpCredential = process.env.IPC_SHARED_SECRET;
    if (tcpPort && (!tcpCredential || tcpCredential.length < 32)) {
      throw new Error('IPC_SHARED_SECRET must contain at least 32 characters when TCP IPC is enabled');
    }
    if (!unixSocket && !tcpPort) throw new Error('an IPC transport is required');
    if (unixSocket) {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      if (fs.existsSync(this.socketPath)) fs.unlinkSync(this.socketPath);

      await new Promise<void>((resolve, reject) => {
        this.server.listen(this.socketPath, () => {
          try {
            fs.chmodSync(this.socketPath, 0o600);
            if (process.getuid?.() === 0) {
              const owner = fs.statSync(dir);
              fs.chownSync(this.socketPath, owner.uid, owner.gid);
            }
          } catch (error) {
            this.server.close();
            reject(error);
            return;
          }
          console.log(`[IPC] Unix socket listening on ${this.socketPath}`);
          resolve();
        });
        this.server.once('error', reject);
      });
    }

    if (tcpPort) {
      this.tcpServer = net.createServer((socket) => this.handleClient(socket, tcpCredential));
      await new Promise<void>((resolve, reject) => {
        this.tcpServer!.listen(tcpPort, '127.0.0.1', () => {
          console.log(`[IPC] TCP socket listening on 127.0.0.1:${tcpPort}`);
          resolve();
        });
        this.tcpServer!.once('error', reject);
      });
    }

    // Scan all adapter/terminal output for dev-server URLs and broadcast proactively.
    this.queue.onOutput((payload) => {
      if (payload.type !== 'output' || !payload.text) return;
      const match = payload.text.match(DEV_SERVER_URL_RE);
      if (!match) return;
      const url = match[0].replace(/[\x1b][\[\]()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><~]/g, '');
      if (url && url !== this.previewUrl) {
        this.previewUrl = url;
        console.log(`[IPC] Dev-server URL detected: ${url}`);
        this.broadcast?.({ type: 'dev_server_url', url });
        this.forward?.('dev_server_url', { url });
      }
    });
  }

  close(): void {
    for (const timer of this.windowCleanupTimers.values()) clearTimeout(timer);
    this.windowCleanupTimers.clear();
    this.clients.forEach((c) => c.destroy());
    this.server.close();
    this.tcpServer?.close();
  }

  private handleClient(socket: net.Socket, credential?: string): void {
    let authenticated = !credential;
    const deadline = credential ? setTimeout(() => socket.destroy(), 5_000) : null;
    if (authenticated) this.clients.add(socket);
    let buf = '';
    let registeredAdapterId: string | null = null;

    // Forward AI output back to the extension
    const off = this.queue.onOutput((payload: OutputPayload) => {
      const data = payload.data && typeof payload.data === 'object'
        ? payload.data as { windowId?: string } : null;
      // Prevent a window's terminal output leaking into other VS Code mirrors.
      if (data?.windowId && this.socketWindows.get(socket) !== data.windowId) return;
      if (authenticated && !socket.destroyed && socket.writable) {
        try {
          socket.write(JSON.stringify({ type: 'output', payload }) + '\n');
        } catch (err) {
          console.warn('[IPC] Failed to write output to socket:', err);
        }
      }
    });

    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => {
      buf += chunk;
      if (buf.length > 4 * 1024 * 1024) {
        socket.destroy();
        return;
      }
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const message = JSON.parse(line) as Record<string, unknown>;
          if (!authenticated) {
            const expected = Buffer.from(credential!);
            const supplied = Buffer.from(typeof message?.token === 'string' ? message.token : '');
            if (message?.type !== 'auth' || supplied.length !== expected.length || !timingSafeEqual(expected, supplied)) {
              socket.destroy();
              return;
            }
            if (deadline) clearTimeout(deadline);
            authenticated = true;
            this.clients.add(socket);
            socket.write('{"type":"auth_ok"}\n');
            continue;
          }
          const control = ['register', 'get_pairing_code', 'relay_setup_link', 'ping'];
          if (this.socketWindows.has(socket) || control.includes(String(message?.type))) {
            this.handleMessage(socket, message);
          }
        } catch {
          // ignore malformed
        }
      }
    });

    socket.on('close', () => {
      if (deadline) clearTimeout(deadline);
      const windowId = this.socketWindows.get(socket);
      this.socketWindows.delete(socket);
      const wasRegistered = Boolean(windowId && this.windowSockets.get(windowId) === socket);
      if (wasRegistered && windowId) {
        this.windowSockets.delete(windowId);
        const record = this.windowStates.get(windowId);
        if (record) this.windowStates.set(windowId, { ...record, connected: false, lastSeen: Date.now() });
        // Keep a short reconnect grace period, then remove obsolete window
        // snapshots. Conversation history is retained on the mobile client.
        const oldTimer = this.windowCleanupTimers.get(windowId);
        if (oldTimer) clearTimeout(oldTimer);
        const timer = setTimeout(() => {
          this.windowCleanupTimers.delete(windowId);
          if (this.windowSockets.has(windowId)) return;
          this.windowStates.delete(windowId);
          this.publishWindows();
        }, 60_000);
        timer.unref();
        this.windowCleanupTimers.set(windowId, timer);
      }
      if (this.activeExtension === socket) {
        this.activeExtension = [...this.windowSockets.values()].at(-1) ?? null;
        const focus = this.getFocusedWindowId();
        const state = this.windowStates.get(focus);
        this.ideState = state?.ideState ?? null;
        this.projects = state?.projects ?? [];
        this.projectsParentDir = state?.parentDir ?? '';
        if (registeredAdapterId && this.adapterOwners.get(registeredAdapterId) === socket) {
          this.adapterOwners.delete(registeredAdapterId);
          this.adapters.unregister(registeredAdapterId);
          if (this.activeExtension) this.registerActiveAdapter(registeredAdapterId, 'VS Code Extension');
        }
      }
      // Publish after choosing the new focused window. Otherwise a disconnected
      // focus ID can be retained in the relay and restored on mobile reload.
      if (wasRegistered) this.publishWindows();
      this.clients.delete(socket);
      off();
    });
    socket.on('error', () => socket.destroy());

    const registerAdapter = (id: string, label: string, proposedWindowId: string) => {
      registeredAdapterId = id;
      const windowId = /^[a-zA-Z0-9-]{1,80}$/.test(proposedWindowId) ? proposedWindowId : 'legacy';
      const alreadyRegistered = this.socketWindows.get(socket);
      if (alreadyRegistered && alreadyRegistered !== windowId) { socket.destroy(); return; }
      const previousSocket = this.windowSockets.get(windowId);
      if (previousSocket && previousSocket !== socket) previousSocket.destroy();
      const cleanupTimer = this.windowCleanupTimers.get(windowId);
      if (cleanupTimer) clearTimeout(cleanupTimer);
      this.windowCleanupTimers.delete(windowId);
      this.windowSockets.set(windowId, socket);
      this.socketWindows.set(socket, windowId);
      const existing = this.windowStates.get(windowId);
      this.windowStates.set(windowId, existing
        ? { ...existing, connected: true, lastSeen: Date.now() }
        : { id: windowId, connected: true, ideState: null, projects: [], parentDir: '', lastSeen: Date.now() });
      this.activeExtension = socket;
      this.ideState = existing?.ideState ?? null;
      this.projects = existing?.projects ?? [];
      this.projectsParentDir = existing?.parentDir ?? '';
      this.registerActiveAdapter(id, label);
      this.publishWindows();
    };

    (socket as net.Socket & { __registerAdapter?: typeof registerAdapter }).__registerAdapter = registerAdapter;
  }

  private handleMessage(socket: net.Socket, msg: Record<string, unknown>): void {
    // Window ownership is derived from the registered IPC socket, never a message field.
    const windowId = this.socketWindows.get(socket);
    switch (msg.type) {
      case 'register': {
        const tool = String(msg.tool ?? '').trim();
        if (!tool) break;
        const label = String(msg.label ?? tool);
        const registerAdapter = (socket as net.Socket & {
          __registerAdapter?: (id: string, label: string, windowId: string) => void
        }).__registerAdapter;
        registerAdapter?.(tool, label, String(msg.windowId ?? 'legacy'));
        break;
      }
      case 'get_pairing_code': {
        void this.sendPairingCode(socket).catch((error) => console.warn('[IPC] Could not send pairing code:', error));
        break;
      }

      case 'chat_message': {
        // AI → phone: relay to WS clients and trigger push
        const text = msg.text as string;
        const isQuestion = this.detectQuestion(text);
        const payload = {
          type: 'ai_message',
          text,
          isQuestion,
          tool: msg.tool,
          target: msg.target,
          direction: msg.direction,
          windowId,
        };
        this.broadcast?.(payload);
        this.forward?.('ai_message', payload);
        if (isQuestion) {
          void this.push.send({
            title: 'DevBridge — Copilot asks',
            body: text.slice(0, 120),
            data: {
              type: 'question',
              text,
              sessionId: this.getRelaySessionId(),
              workspaceId: this.workspaceId,
              windowId,
            },
          });
        }
        break;
      }
      case 'ide_snapshot': {
        const state = {
          workspaceFolders: Array.isArray(msg.workspaceFolders) ? msg.workspaceFolders : [],
          activeFile: msg.activeFile ?? null,
          activeLanguage: msg.activeLanguage ?? null,
          activeTerminal: msg.activeTerminal ?? null,
          activeTerminalId: msg.activeTerminalId ?? null,
          terminals: Array.isArray(msg.terminals) ? msg.terminals : [],
          updatedAt: typeof msg.updatedAt === 'number' ? msg.updatedAt : Date.now(),
        };
        if (windowId) {
          const record = this.windowStates.get(windowId);
          if (record) this.windowStates.set(windowId, { ...record, ideState: state, lastSeen: Date.now() });
          if (this.activeExtension === socket) this.ideState = state;
          this.publishWindows();
        }
        this.broadcast?.({ type: 'ide_snapshot', state, windowId });
        this.forward?.('ide_snapshot', { payload: { state, windowId } });
        break;
      }
      case 'ide_event': {
        const payload = {
          type: 'ide_event',
          kind: msg.kind,
          terminal: msg.terminal,
          commandLine: msg.commandLine,
          executionId: msg.executionId,
          exitCode: msg.exitCode,
          terminalId: msg.terminalId,
          windowId,
          activeFile: msg.activeFile,
          language: msg.language,
          target: msg.target,
          textPreview: msg.textPreview,
          workspaceFolders: msg.workspaceFolders,
          ts: msg.ts,
        };
        if (windowId && (msg.kind === 'terminal_command_started' || msg.kind === 'terminal_command_finished')) {
          const record = this.windowStates.get(windowId);
          if (record) {
            const nextState = msg.kind === 'terminal_command_started' ? 'running' : 'finished';
            this.windowStates.set(windowId, {
              ...record, lastSeen: Date.now(), activity: {
                state: nextState, terminalId: String(msg.terminalId ?? ''),
                updatedAt: Date.now(),
              },
            });
            this.publishWindows();
          }
        }
        this.broadcast?.(payload);
        this.forward?.('ide_event', payload);
        if (msg.kind === 'terminal_command_started') this.activity.started(payload);
        if (msg.kind === 'terminal_command_finished') this.activity.finished(payload);
        break;
      }
      case 'command_execution': {
        const payload = {
          request_id: typeof msg.request_id === 'string' ? msg.request_id : '',
          action: msg.action,
          phase: msg.phase,
          reason: msg.reason,
          terminalId: msg.terminalId,
          terminalName: msg.terminalName,
          windowId,
        };
        if (!payload.request_id || !['dispatched', 'rejected'].includes(String(payload.phase))) break;
        this.broadcast?.({ type: 'command_execution', ...payload });
        this.forward?.('command_execution', payload);
        break;
      }
      case 'preview_capture_result': {
        const requestId = String(msg.request_id ?? '');
        if (!windowId || !requestId) break;
        const image = typeof msg.image === 'string' ? msg.image : '';
        const success = msg.success === true && image.length > 0 && image.length <= 700000
          && /^[A-Za-z0-9+/=]+$/.test(image);
        const payload = { windowId, request_id: requestId, success,
          image: success ? image : undefined, mime: 'image/png',
          error: success ? undefined : String(msg.error ?? 'preview_failed').slice(0, 120) };
        this.broadcast?.({ type: 'preview_capture_result', ...payload });
        this.forward?.('preview_capture_result', payload);
        break;
      }
      case 'terminal_screen': {
        // Ephemeral screen snapshots: never store in the MessageQueue history.
        // Window identity is derived from the authenticated IPC socket.
        if (!windowId) break;
        const text = typeof msg.text === 'string' ? msg.text : '';
        const terminalId = typeof msg.terminalId === 'string' ? msg.terminalId : '';
        if (!terminalId || text.length > 24_000) break;
        const frame = { text, terminalId, windowId, ts: typeof msg.ts === 'number' ? msg.ts : Date.now() };
        this.broadcast?.({ type: 'terminal_screen', ...frame });
        this.forward?.('terminal_screen', frame);
        this.activity.output(frame, 'screen');
        break;
      }
      case 'terminal_output': {
        const text = String(msg.text ?? '');
        if (!text) break;
        const tool = String(msg.tool ?? 'vscode-terminal');
        const terminalId = String(msg.terminalId ?? '');
        const terminalName = String(msg.terminal ?? '');
        const payload: OutputPayload = {
          type: 'output',
          text,
          tool,
          data: { terminalId, terminalName, windowId },
        };
        this.queue.emit(payload);
        this.activity.output({ windowId, terminalId }, 'output');

        // Purely heuristic: notify that intervention *may* be required.
        // Never automatically answer a trust/approval prompt.
        const key = `${windowId ?? 'unknown'}:${terminalId || terminalName || tool}`;
        const previous = this.terminalQuestionState.get(key) ?? {
          text: '', notifiedAt: 0, candidateSince: 0, hits: 0,
        };
        const plain = (previous.text + text)
          .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
          .slice(-1000);
        const now = Date.now();
        const tail = plain.split(/\r?\n/).slice(-3).join('\n').trim();
        const question = this.detectQuestion(tail);
        // A terminal might *print* a question in its logs without waiting for
        // any reply. Require at least two observations and 15 s of persistence.
        // Also rate-limit per terminal for five minutes; this is NOT a structured
        // permission/approval event.
        const candidateSince = question ? (previous.candidateSince || now) : 0;
        const hits = question ? Math.min(8, previous.hits + 1) : 0;
        const requiresAttention = question && hits >= 2
          && now - candidateSince >= 15_000 && now - previous.notifiedAt >= 300_000;
        this.terminalQuestionState.set(key, {
          text: plain, candidateSince: requiresAttention ? 0 : candidateSince,
          hits: requiresAttention ? 0 : hits,
          notifiedAt: requiresAttention ? now : previous.notifiedAt,
        });
        if (this.terminalQuestionState.size > 200) {
          const oldest = this.terminalQuestionState.keys().next().value;
          if (oldest) this.terminalQuestionState.delete(oldest);
        }
        if (requiresAttention) {
          if (windowId) {
            const record = this.windowStates.get(windowId);
            if (record) {
              this.windowStates.set(windowId, { ...record, lastSeen: Date.now(),
                activity: { state: 'attention_possible', terminalId, updatedAt: Date.now() } });
              this.publishWindows();
            }
          }
          const notification = {
            type: 'notification', text: 'Une intervention pourrait être nécessaire dans ' + (terminalName || 'un terminal'),
            terminalId, terminalName, windowId, tool, isQuestion: true, target: tool,
          };
          this.broadcast?.(notification);
          this.forward?.('notification', notification);
          this.activity.possibleQuestion({ windowId, terminalId });
          void this.push.send({
            title: 'VibeBridge - intervention possible',
            body: 'Vérifie le terminal ' + (terminalName || 'actif') + ' depuis VibeBridge.',
            data: { type: 'question', terminalId, windowId, workspaceId: this.workspaceId, sessionId: this.getRelaySessionId() },
          });
        }
        break;
      }
      case 'host_clis': {
        // Only a registered local extension may define host tools.
        if (socket !== this.activeExtension) break;
        this.cliRegistry?.replaceHostTools(
          Array.isArray(msg.definitions) ? msg.definitions as import('./cliRegistry').HostToolDefinition[] : [],
        );
        break;
      }
      case 'cli_report': {
        // Extension reports which CLIs are installed on the host
        const detectedIds = Array.isArray(msg.detected)
          ? (msg.detected as unknown[]).map(String)
          : [];
        this.cliRegistry?.applyExtensionReport(detectedIds);
        const clis = this.cliRegistry?.getAll() ?? [];
        this.broadcast?.({ type: 'clis_update', clis });
        break;
      }
      case 'terminal_interpret_result': {
        const payload={windowId,request_id:msg.request_id,
          terminalId:typeof msg.terminalId==='string'?msg.terminalId.slice(0,80):'',
          ok:msg.ok===true,readout:msg.readout,
          error:typeof msg.error==='string'?msg.error.slice(0,100):undefined};
        this.broadcast?.({type:'terminal_interpret_result',...payload});
        this.forward?.('terminal_interpret_result',payload);
        break;
      }
      case 'cli_sessions_result': {
        // Only the authenticated extension that owns windowId may respond.
        const sessions=Array.isArray(msg.sessions) ? msg.sessions.slice(0,30) : [];
        const payload={windowId,request_id:msg.request_id,sessions,
          error:typeof msg.error==='string'?msg.error.slice(0,80):undefined};
        this.broadcast?.({type:'cli_sessions_result',...payload});
        this.forward?.('cli_sessions_result',payload);
        break;
      }
      case 'cli_started': {
        // Extension confirms terminal was opened
        const payload = { type: 'cli_started', cliId: msg.cliId, terminalName: msg.terminalName, terminalId: msg.terminalId, windowId };
        this.broadcast?.(payload);
        this.forward?.('cli_started', payload);
        break;
      }
      case 'terminal_unavailable': {
        const payload = { type: 'terminal_unavailable', terminalName: msg.terminalName, windowId };
        this.broadcast?.(payload);
        this.forward?.('terminal_unavailable', payload);
        break;
      }
      case 'terminal_created': {
        const payload = { type: 'terminal_created', terminalName: msg.terminalName, terminalId: msg.terminalId,
          mirrorSession: msg.mirrorSession, windowId };
        this.broadcast?.(payload);
        this.forward?.('terminal_created', payload);
        break;
      }
      case 'terminal_closed': {
        // Extension reports a terminal was closed (manually or via kill_cli)
        const payload = { type: 'terminal_closed', terminalName: msg.terminalName, terminalId: msg.terminalId, windowId };
        this.broadcast?.(payload);
        this.forward?.('terminal_closed', payload);
        this.activity.closed({ windowId, terminalId: msg.terminalId });
        break;
      }
      case 'file_changed': {
        const payload = { type: 'file_changed', path: msg.path, event: msg.event, windowId };
        this.broadcast?.(payload);
        this.forward?.('file_changed', payload);
        break;
      }
      case 'projects_report': {
        const parentDir = String(msg.parentDir ?? '');
        const projects = Array.isArray(msg.projects)
          ? (msg.projects as Array<{ name: string; path: string; isActive: boolean }>)
          : [];
        if (windowId) {
          const record = this.windowStates.get(windowId);
          if (record) this.windowStates.set(windowId, { ...record, projects, parentDir, lastSeen: Date.now() });
          this.publishWindows();
        }
        if (this.activeExtension === socket) {
          this.projects = projects;
          this.projectsParentDir = parentDir;
        }
        const update = { projects, parentDir, windowId };
        this.broadcast?.({ type: 'projects_update', ...update });
        this.forward?.('projects_update', update);
        break;
      }
      case 'inject_message': {
        // phone → AI (already routed via HTTP /message, but can also arrive via IPC)
        this.adapters.send({ text: msg.text as string, target: msg.target as string | undefined });
        break;
      }
      case 'relay_setup_link': {
        const setupToken = String(msg.setupToken ?? '').trim();
        if (!setupToken) break;
        const acknowledge = (ok: boolean) => this.writeToExtension(socket, { type: 'relay_setup_ack', ok });
        if (!this.applyRelaySetup) {
          acknowledge(false);
          break;
        }
        void Promise.resolve(this.applyRelaySetup(setupToken)).then(
          () => acknowledge(true),
          () => acknowledge(false),
        );
        break;
      }
    }
  }

  private async sendPairingCode(socket: net.Socket): Promise<void> {
    if (this.renewRelayQr) {
      try {
        this.relayQrUrl = await this.renewRelayQr();
      } catch {
        this.relayQrUrl = null;
      }
    }
    if (socket.destroyed || !socket.writable) return;
    const agentHost = process.env.NUXT_PUBLIC_AGENT_HOST ?? process.env.AGENT_HOST ?? 'devbridge.local';
    const agentPort = process.env.AGENT_PORT ?? '3333';
    const uiPort = process.env.NUXT_UI_PORT ?? process.env.UI_PORT ?? '8080';
    const publicUiUrl = (process.env.UI_PUBLIC_URL ?? '').trim().replace(/\/$/, '');
    const workspaceId = String(process.env.WORKSPACE_ID ?? process.env.PROJECT_ROOT ?? 'workspace').trim().split(/[\\/]/).filter(Boolean).pop() ?? 'workspace';
    const shortToken = this.auth.issueShortLivedToken(600);
    const agentUrl = `http://${agentHost}:${agentPort}`;
    const localQrBase = publicUiUrl || `http://${agentHost}:${uiPort}`;
    const localQrUrl = publicUiUrl && this.relayQrUrl
      ? undefined
      : publicUiUrl
        ? `${localQrBase}/?token=${encodeURIComponent(shortToken)}&workspace=${encodeURIComponent(workspaceId)}`
        : `${localQrBase}/?view=mobile&agentUrl=${encodeURIComponent(agentUrl)}&token=${encodeURIComponent(shortToken)}&workspace=${encodeURIComponent(workspaceId)}`;
    socket.write(JSON.stringify({
      type: 'pairing_code',
      code: this.auth.getPairCode(),
      qrUrl: this.relayQrUrl ?? undefined,
      localQrUrl,
    }) + '\n');
  }

  /** Never fall back to the focused window if more than one is connected. */
  sendToExtension(data: unknown): boolean {
    if (!data || typeof data !== 'object') return false;
    const frame = data as Record<string, unknown>;
    const requested = typeof frame.windowId === 'string' ? frame.windowId : '';
    const connected = [...this.windowSockets.entries()].filter(([, socket]) => !socket.destroyed);
    const socket = requested
      ? this.windowSockets.get(requested)
      : connected.length === 1 ? connected[0]![1] : undefined;
    return socket ? this.writeToExtension(socket, data) : false;
  }

  getFocusedWindowId(): string {
    return [...this.windowSockets.entries()].find(([, socket]) => socket === this.activeExtension)?.[0] ?? '';
  }

  getWindows() {
    return [...this.windowStates.values()].map(record => ({
      id: record.id,
      connected: this.windowSockets.has(record.id) && record.connected,
      workspaceFolders: Array.isArray(record.ideState?.workspaceFolders) ? record.ideState.workspaceFolders : [],
      ideState: record.ideState,
      projects: record.projects,
      activity: record.activity,
      lastSeen: record.lastSeen,
    }));
  }

  private publishWindows(): void {
    const update = { windows: this.getWindows(), focusedWindowId: this.getFocusedWindowId() };
    this.broadcast?.({ type: 'windows_update', ...update });
    this.forward?.('windows_update', update);
  }

  private registerActiveAdapter(id: string, label: string): void {
    this.adapters.registerIpcAdapter(id, label, (data: unknown) => {
      if (!this.sendToExtension(data)) throw new Error('No unambiguous VS Code window selected');
    });
    if (this.activeExtension) this.adapterOwners.set(id, this.activeExtension);
  }

  private writeToExtension(socket: net.Socket, data: unknown): boolean {
    if (socket.destroyed || !socket.writable || socket.writableLength > 4 * 1024 * 1024) return false;
    try {
      socket.write(JSON.stringify(data) + '\n');
      return true;
    } catch (error) {
      console.warn('[IPC] Failed to write to extension socket:', error);
      return false;
    }
  }

  setRelayQrUrl(url: string | null): void {
    this.relayQrUrl = url;
  }

  getIdeState(windowId?: string): Record<string, unknown> | null {
    if (windowId) return this.windowStates.get(windowId)?.ideState ?? null;
    return this.ideState;
  }

  getPreviewUrl(): string | null {
    return this.previewUrl;
  }

  getProjects(windowId?: string): Array<{ name: string; path: string; isActive: boolean }> {
    if (windowId) return this.windowStates.get(windowId)?.projects ?? [];
    return this.projects;
  }

  getProjectsParentDir(windowId?: string): string {
    if (windowId) return this.windowStates.get(windowId)?.parentDir ?? '';
    return this.projectsParentDir;
  }

  private detectQuestion(text: string): boolean {
    if (!text) return false;
    const lower = text.toLowerCase();
    const patterns = [
      /\?$/, /\?\s*$/, /shall i/i, /should i/i, /voulez-vous/i,
      /do you want/i, /would you like/i, /approve|deny|yes\/no/i,
    ];
    return patterns.some((p) => p.test(lower));
  }
}
