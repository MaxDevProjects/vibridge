/**
 * DevBridge Agent — Pseudo-TTY CLI Adapter (base)
 * Wraps any interactive CLI tool (Codex CLI, Claude Code, etc.)
 * using node-pty, intercepting stdin/stdout.
 */
import * as pty from 'node-pty';
import type { MessageQueue } from '../queue';
import type { Adapter, SendOptions } from './base';

export abstract class PtyAdapter implements Adapter {
  abstract readonly id: string;
  abstract readonly label: string;

  protected term: pty.IPty | null = null;
  protected outputBuf = '';

  constructor(
    protected readonly command: string,
    protected readonly args: string[],
    protected readonly queue: MessageQueue,
    protected readonly cwd: string = process.env.PROJECT_ROOT ?? '/workspace'
  ) {}

  protected spawn(): void {
    this.term = pty.spawn(this.command, this.args, {
      name: 'xterm-color',
      cols: 220,
      rows: 50,
      cwd: this.cwd,
      env: process.env as Record<string, string>,
    });

    this.term.onData((data: string) => {
      this.outputBuf += data;
      this.onDataChunk(data);
      this.queue.emit({ type: 'output', text: data, tool: this.id });
    });

    this.term.onExit(({ exitCode }) => {
      console.log(`[${this.id}] process exited with code ${exitCode}`);
      this.term = null;
      this.queue.emit({ type: 'adapter_exit', tool: this.id, data: { exitCode } });
    });

    console.log(`[${this.id}] Spawned PID ${this.term.pid}`);
  }

  isActive(): boolean {
    return this.term !== null;
  }

  protected onDataChunk(_data: string): void {}

  send({ text }: SendOptions): void {
    if (!this.term) this.spawn();
    this.term!.write(text + '\n');
  }

  async runAction(action: string, args: string[]): Promise<void> {
    const line = [action, ...args].join(' ');
    this.send({ text: line });
  }

  getPreviewUrl(): string | null {
    // Detect common dev-server patterns in output
    const match = this.outputBuf.match(/https?:\/\/localhost:\d+/);
    return match ? match[0] : null;
  }

  destroy(): void {
    try {
      this.term?.kill();
    } catch {
      // ignore
    }
    this.term = null;
  }
}
