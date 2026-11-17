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
  | { kind: 'tcp'; host: string; port: number; token: string };

export class IpcClient extends EventEmitter {
  private socket: net.Socket | null = null;
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
    if (!this.shouldConnect || this.socket) return;
    const sock =
      this.target.kind === 'tcp'
        ? net.createConnection({ host: this.target.host, port: this.target.port })
        : net.createConnection(this.target.path);

    this.socket = sock;
    let buffer = '';
    const deadline = setTimeout(() => sock.destroy(), 5_000);
    sock.setEncoding('utf8');
    const onAuthenticated = () => {
      if (this.socket !== sock || this._connected) return;
      clearTimeout(deadline);
      this._connected = true;
      this.reconnectDelay = 1_000;
      console.log('[IPC] Connected to agent');
      this._send({ type: 'register', tool: 'vscode', label: 'VS Code Extension' });
      this.emit('connected');
    };
    sock.once('connect', () => {
      if (this.target.kind === 'tcp') this._send({ type: 'auth', token: this.target.token });
      else onAuthenticated();
    });

    sock.on('data', (chunk: string) => {
      if (this.socket !== sock) return;
      buffer += chunk;
      if (buffer.length > 4 * 1024 * 1024) {
        sock.destroy();
        return;
      }
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line) as AgentMessage;
          if (!this._connected) {
            if (msg?.type === 'auth_ok') onAuthenticated();
            continue;
          }
          this.emit('message', msg);
          this.emit(msg.type, msg);
        } catch {
          // ignore
        }
      }
    });

    sock.on('close', () => {
      clearTimeout(deadline);
      if (this.socket !== sock) return;
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
    const socket = this.socket;
    if (!socket || socket.destroyed || !socket.writable) return;
    try {
      socket.write(JSON.stringify(data) + '\n');
    } catch (err) {
      console.warn('[IPC] Failed to send message:', err);
    }
  }

  async requestPairingCode(): Promise<{ code: string; qrUrl?: string; localQrUrl?: string } | null> {
    return new Promise((resolve) => {
      if (!this._connected) {
        resolve(null);
        return;
      }
      let settled = false;
      const handler = (msg: AgentMessage) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve({
          code: msg.code as string,
          qrUrl: msg.qrUrl as string | undefined,
          localQrUrl: msg.localQrUrl as string | undefined,
        });
      };
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.removeListener('pairing_code', handler);
        resolve(null);
      }, 3_000);
      this.once('pairing_code', handler);
      this._send({ type: 'get_pairing_code' });
    });
  }
}
