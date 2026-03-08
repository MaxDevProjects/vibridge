/**
 * DevBridge Agent — Claude Code CLI adapter (node-pty)
 */
import type { MessageQueue } from '../queue';
import { PtyAdapter } from './pty-adapter';

export class ClaudeCliAdapter extends PtyAdapter {
  readonly id = 'claude-cli';
  readonly label = 'Claude Code CLI';

  constructor(queue: MessageQueue, cwd?: string) {
    // `claude` is the Anthropic Claude Code CLI command — spawned lazily on first send()
    super('claude', [], queue, cwd);
  }
}
