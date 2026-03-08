/**
 * DevBridge Agent — Codex CLI adapter (node-pty)
 */
import type { MessageQueue } from '../queue';
import { PtyAdapter } from './pty-adapter';

export class CodexCliAdapter extends PtyAdapter {
  readonly id = 'codex-cli';
  readonly label = 'Codex CLI';
  private pending: string[] = [];
  private trustAnswered = false;
  private ready = false;

  constructor(queue: MessageQueue, cwd?: string) {
    // Use inline mode to avoid alternate-screen redraw noise in the mobile bridge.
    super('codex', ['--no-alt-screen'], queue, cwd);
  }

  override send({ text }: { text: string }): void {
    if (!this.term) this.spawn();
    if (!this.ready) {
      this.pending.push(text);
      return;
    }
    this.term!.write(text + '\n');
  }

  protected override onDataChunk(data: string): void {
    if (!this.term) return;

    if (!this.trustAnswered && data.includes('Do you trust the contents of this directory?')) {
      this.trustAnswered = true;
      this.term.write('1\n');
      return;
    }

    if (!this.ready && (
      data.includes('To get started, describe a task') ||
      data.includes('context left') ||
      data.includes('/review - review any changes and find issues')
    )) {
      this.ready = true;
      while (this.pending.length) {
        const next = this.pending.shift();
        if (next) this.term.write(next + '\n');
      }
    }
  }
}
