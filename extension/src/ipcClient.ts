/**
 * DevBridge VS Code Extension — IPC Client
 * Connects to the DevBridge Agent via Unix socket OR TCP (host:port).
 */
import net from 'net';
import { EventEmitter } from 'events';

interface AgentMessage {
  type: string;
  [key: string]: unknown;
}

export type IpcTarget =
  | { kind: 'unix'; path: string }
  | { kind: 'tcp'; host: string; port: number };

export class IpcClient extends EventEmitter {
  private socket: net.Socket | null = null;
  private buf = '';
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectDelay = 1_000;
  private shouldConnect = false;
  private _connected = false;

  constructor(private target: IpcTarget) {
    super();
  }

  connect(): void {
    this.shouldConnect = true;
    this._tryConnect();
  }

  private _tryConnect(): void {
    if (!this.shouldConnect) return;
    const sock =
      this.target.kind === 'tcp'
        ? net.createConnection({ host: this.target.host, port: this.target.port })
        : net.createConnection(this.target.path);

    sock.setEncoding('utf8');
    sock.once('connect', () => {
      this._connected = true;
      this.reconnectDelay = 1_000;
      this.socket = sock;
      console.log('[IPC] Connected to agent');
      this.emit('connected');
      // Register this extension with the agent
      this._send({ type: 'register', tool: 'vscode', label: 'VS Code Extension' });
    });

    sock.on('data', (chunk: string) => {
      this.buf += chunk;
      const lines = this.buf.split('\n');
      this.buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line) as AgentMessage;
          this.emit('message', msg);
          this.emit(msg.type, msg);
        } catch {
          // ignore
        }
      }
    });

    sock.on('close', () => {
      this._connected = false;
      this.socket = null;
      this.emit('disconnected');
      if (this.shouldConnect) {
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30_000);
        console.log(`[IPC] Reconnecting in ${this.reconnectDelay}ms…`);
        this.reconnectTimer = setTimeout(() => this._tryConnect(), this.reconnectDelay);
      }
    });

    sock.on('error', (err) => {
      console.warn(`[IPC] Socket error: ${err.message}`);
    });
  }

  disconnect(): void {
    this.shouldConnect = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.socket?.destroy();
    this.socket = null;
    this._connected = false;
  }

  isConnected(): boolean {
    return this._connected;
  }

  send(data: unknown): void {
    if (!this._connected || !this.socket) {
      console.warn('[IPC] Not connected — message dropped');
      return;
    }
    this._send(data);
  }

  private _send(data: unknown): void {
    this.socket?.write(JSON.stringify(data) + '\n');
  }

  async requestPairingCode(): Promise<{ code: string; qrUrl?: string; localQrUrl?: string } | null> {
    return new Promise((resolve) => {
      if (!this._connected) {
        resolve(null);
        return;
      }
      const timeout = setTimeout(() => resolve(null), 3_000);
      this.once('pairing_code', (msg: AgentMessage) => {
        clearTimeout(timeout);
        resolve({
          code: msg.code as string,
          qrUrl: msg.qrUrl as string | undefined,
          localQrUrl: msg.localQrUrl as string | undefined,
        });
      });
      this._send({ type: 'get_pairing_code' });
    });
  }
}
