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

// Matches http://localhost:PORT or http://127.0.0.1:PORT with optional path, ignoring ANSI.
const DEV_SERVER_URL_RE = /https?:\/\/(?:localhost|127\.0\.0\.1)(:\d+)?(?:\/[^\s\x1b]*)*/;

export class IpcServer {
  private server: net.Server;
  private activeExtension: net.Socket | null = null;
  private adapterOwners = new Map<string, net.Socket>();
  private tcpServer: net.Server | null = null;
  private clients = new Set<net.Socket>();
  private ideState: Record<string, unknown> | null = null;
  private previewUrl: string | null = null;
  private terminalQuestionState = new Map<string, { text: string; notifiedAt: number }>();
  private relayQrUrl: string | null = null;
  private projects: Array<{ name: string; path: string; isActive: boolean }> = [];
  private projectsParentDir = '';
  broadcast?: (data: unknown) => void;
  forward?: (type: string, payload?: Record<string, unknown>) => void;

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
          if (socket === this.activeExtension || control.includes(String(message?.type))) {
            this.handleMessage(socket, message);
          }
        } catch {
          // ignore malformed
        }
      }
    });

    socket.on('close', () => {
      if (deadline) clearTimeout(deadline);
      if (this.activeExtension === socket) {
        this.activeExtension = null;
        this.ideState = null;
      }
      if (registeredAdapterId && this.adapterOwners.get(registeredAdapterId) === socket) {
        this.adapterOwners.delete(registeredAdapterId);
        this.adapters.unregister(registeredAdapterId);
      }
      this.clients.delete(socket);
      off();
    });
    socket.on('error', () => socket.destroy());

    const registerAdapter = (id: string, label: string) => {
      registeredAdapterId = id;
      this.activeExtension = socket;
      this.adapterOwners.set(id, socket);
      this.adapters.registerIpcAdapter(id, label, (data: unknown) => {
        if (this.activeExtension !== socket || !this.writeToExtension(socket, data)) {
          throw new Error('VS Code extension unavailable');
        }
      });
    };

    (socket as net.Socket & { __registerAdapter?: typeof registerAdapter }).__registerAdapter = registerAdapter;
  }

  private handleMessage(socket: net.Socket, msg: Record<string, unknown>): void {
    switch (msg.type) {
      case 'register': {
        const tool = String(msg.tool ?? '').trim();
        if (!tool) break;
        const label = String(msg.label ?? tool);
        const registerAdapter = (socket as net.Socket & {
          __registerAdapter?: (id: string, label: string) => void
        }).__registerAdapter;
        registerAdapter?.(tool, label);
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
            },
          });
        }
        break;
      }
      case 'ide_snapshot': {
        this.ideState = {
          workspaceFolders: Array.isArray(msg.workspaceFolders) ? msg.workspaceFolders : [],
          activeFile: msg.activeFile ?? null,
          activeLanguage: msg.activeLanguage ?? null,
          activeTerminal: msg.activeTerminal ?? null,
          terminals: Array.isArray(msg.terminals) ? msg.terminals : [],
          updatedAt: typeof msg.updatedAt === 'number' ? msg.updatedAt : Date.now(),
        };
        this.broadcast?.({ type: 'ide_snapshot', state: this.ideState });
        this.forward?.('ide_snapshot', { payload: { state: this.ideState } });
        break;
      }
      case 'ide_event': {
        const payload = {
          type: 'ide_event',
          kind: msg.kind,
          terminal: msg.terminal,
          commandLine: msg.commandLine,
          activeFile: msg.activeFile,
          language: msg.language,
          target: msg.target,
          textPreview: msg.textPreview,
          workspaceFolders: msg.workspaceFolders,
          ts: msg.ts,
        };
        this.broadcast?.(payload);
        this.forward?.('ide_event', payload);
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
        };
        if (!payload.request_id || !['dispatched', 'rejected'].includes(String(payload.phase))) break;
        this.broadcast?.({ type: 'command_execution', ...payload });
        this.forward?.('command_execution', payload);
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
          data: { terminalId, terminalName },
        };
        this.queue.emit(payload);

        // Purely heuristic: notify that intervention *may* be required.
        // Never automatically answer a trust/approval prompt.
        const key = terminalId || terminalName || tool;
        const previous = this.terminalQuestionState.get(key) ?? { text: '', notifiedAt: 0 };
        const plain = (previous.text + text)
          .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
          .slice(-1000);
        const now = Date.now();
        const tail = plain.split(/\r?\n/).slice(-3).join('\n').trim();
        const requiresAttention = this.detectQuestion(tail) && now - previous.notifiedAt > 60_000;
        this.terminalQuestionState.set(key, {
          text: plain,
          notifiedAt: requiresAttention ? now : previous.notifiedAt,
        });
        if (requiresAttention) {
          const notification = {
            type: 'notification', text: 'Une intervention pourrait être nécessaire dans ' + (terminalName || 'un terminal'),
            terminalId, terminalName, tool, isQuestion: true, target: tool,
          };
          this.broadcast?.(notification);
          this.forward?.('notification', notification);
          void this.push.send({
            title: 'VibeBridge - intervention possible',
            body: 'Vérifie le terminal ' + (terminalName || 'actif') + ' depuis VibeBridge.',
            data: { type: 'question', terminalId, workspaceId: this.workspaceId, sessionId: this.getRelaySessionId() },
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
      case 'cli_started': {
        // Extension confirms terminal was opened
        const payload = { type: 'cli_started', cliId: msg.cliId, terminalName: msg.terminalName, terminalId: msg.terminalId };
        this.broadcast?.(payload);
        this.forward?.('cli_started', payload);
        break;
      }
      case 'terminal_unavailable': {
        const payload = { type: 'terminal_unavailable', terminalName: msg.terminalName };
        this.broadcast?.(payload);
        this.forward?.('terminal_unavailable', payload);
        break;
      }
      case 'terminal_created': {
        const payload = { type: 'terminal_created', terminalName: msg.terminalName, terminalId: msg.terminalId };
        this.broadcast?.(payload);
        this.forward?.('terminal_created', payload);
        break;
      }
      case 'terminal_closed': {
        // Extension reports a terminal was closed (manually or via kill_cli)
        const payload = { type: 'terminal_closed', terminalName: msg.terminalName, terminalId: msg.terminalId };
        this.broadcast?.(payload);
        this.forward?.('terminal_closed', payload);
        break;
      }
      case 'file_changed': {
        const payload = { type: 'file_changed', path: msg.path, event: msg.event };
        this.broadcast?.(payload);
        this.forward?.('file_changed', payload);
        break;
      }
      case 'projects_report': {
        this.projectsParentDir = String(msg.parentDir ?? '');
        this.projects = Array.isArray(msg.projects)
          ? (msg.projects as Array<{ name: string; path: string; isActive: boolean }>)
          : [];
        this.broadcast?.({ type: 'projects_update', projects: this.projects, parentDir: this.projectsParentDir });
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

  sendToExtension(data: unknown): boolean {
    return this.activeExtension ? this.writeToExtension(this.activeExtension, data) : false;
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

  getIdeState(): Record<string, unknown> | null {
    return this.ideState;
  }

  getPreviewUrl(): string | null {
    return this.previewUrl;
  }

  getProjects(): Array<{ name: string; path: string; isActive: boolean }> {
    return this.projects;
  }

  getProjectsParentDir(): string {
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
