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

export class IpcServer {
  private server: net.Server;
  private tcpServer: net.Server | null = null;
  private clients = new Set<net.Socket>();
  private ideState: Record<string, unknown> | null = null;
  broadcast?: (data: unknown) => void;
  forward?: (type: string, payload?: Record<string, unknown>) => void;

  constructor(
    private socketPath: string,
    private adapters: AdapterManager,
    private queue: MessageQueue,
    private push: PushService,
    private auth: AuthService
  ) {
    this.server = net.createServer((socket) => this.handleClient(socket));
  }

  async listen(tcpPort?: number): Promise<void> {
    // Remove stale socket file if it exists
    const dir = path.dirname(this.socketPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(this.socketPath)) fs.unlinkSync(this.socketPath);

    await new Promise<void>((resolve, reject) => {
      this.server.listen(this.socketPath, () => {
        fs.chmodSync(this.socketPath, 0o666);
        console.log(`[IPC] Unix socket listening on ${this.socketPath}`);
        resolve();
      });
      this.server.once('error', reject);
    });

    if (tcpPort) {
      this.tcpServer = net.createServer((socket) => this.handleClient(socket));
      await new Promise<void>((resolve, reject) => {
        this.tcpServer!.listen(tcpPort, '127.0.0.1', () => {
          console.log(`[IPC] TCP socket listening on 127.0.0.1:${tcpPort}`);
          resolve();
        });
        this.tcpServer!.once('error', reject);
      });
    }
  }

  close(): void {
    this.clients.forEach((c) => c.destroy());
    this.server.close();
    this.tcpServer?.close();
  }

  private handleClient(socket: net.Socket): void {
    this.clients.add(socket);
    let buf = '';
    let registeredAdapterId: string | null = null;

    // Forward AI output back to the extension
    const off = this.queue.onOutput((payload: OutputPayload) => {
      if (!socket.destroyed) {
        socket.write(JSON.stringify({ type: 'output', payload }) + '\n');
      }
    });

    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => {
      buf += chunk;
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          this.handleMessage(socket, JSON.parse(line) as Record<string, unknown>);
        } catch {
          // ignore malformed
        }
      }
    });

    socket.on('close', () => {
      if (registeredAdapterId) this.adapters.unregister(registeredAdapterId);
      this.clients.delete(socket);
      off();
    });
    socket.on('error', () => {
      if (registeredAdapterId) this.adapters.unregister(registeredAdapterId);
      this.clients.delete(socket);
      off();
    });

    const registerAdapter = (id: string, label: string) => {
      registeredAdapterId = id;
      this.adapters.registerIpcAdapter(id, label, (data: unknown) => {
        if (!socket.destroyed) {
          socket.write(JSON.stringify(data) + '\n');
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
        if (!socket.destroyed) {
          socket.write(JSON.stringify({ type: 'pairing_code', code: this.auth.getPairCode() }) + '\n');
        }
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
            data: { type: 'question', text },
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
      case 'terminal_output': {
        const text = String(msg.text ?? '');
        if (!text) break;
        const payload: OutputPayload = {
          type: 'output',
          text,
          tool: String(msg.tool ?? 'vscode-terminal'),
        };
        this.queue.emit(payload);
        break;
      }
      case 'file_changed': {
        const payload = { type: 'file_changed', path: msg.path, event: msg.event };
        this.broadcast?.(payload);
        this.forward?.('file_changed', payload);
        break;
      }
      case 'inject_message': {
        // phone → AI (already routed via HTTP /message, but can also arrive via IPC)
        this.adapters.send({ text: msg.text as string, target: msg.target as string | undefined });
        break;
      }
    }
  }

  /** Send a message to all connected VS Code extension instances */
  sendToExtension(data: unknown): void {
    const line = JSON.stringify(data) + '\n';
    this.clients.forEach((c) => {
      if (!c.destroyed) c.write(line);
    });
  }

  getIdeState(): Record<string, unknown> | null {
    return this.ideState;
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
