/**
 * DevBridge Agent — Adapter Manager
 * Manages the pool of tool adapters and routes messages to the active one.
 * VS Code adapters (Copilot, Claude, Cursor, Windsurf) are registered
 * dynamically by the IPC connection from the VS Code extension.
 */
import type { MessageQueue } from '../queue';
import type { Adapter, SendOptions } from './base';
import { CodexCliAdapter } from './codex-cli';
import { ClaudeCliAdapter } from './claude-cli';
import { spawnSync } from 'child_process';

function commandExists(command: string): boolean {
  const probe = spawnSync('sh', ['-lc', `command -v ${command}`], { stdio: 'ignore' });
  return probe.status === 0;
}

/** Thin proxy for VS Code-side adapters — relayed via IPC */
class IpcAdapter implements Adapter {
  constructor(
    readonly id: string,
    readonly label: string,
    private sendToExtension: (msg: unknown) => void
  ) {}

  isActive(): boolean {
    return true;
  }

  isAvailable(): boolean {
    return true;
  }

  unavailableReason(): string | null {
    return null;
  }

  send({ text, target }: SendOptions): void {
    this.sendToExtension({ type: 'inject_message', text, target });
  }

  async runAction(action: string, args: string[]): Promise<void> {
    this.sendToExtension({ type: 'action', action, args });
  }

  getPreviewUrl(): string | null {
    return null;
  }

  destroy(): void {}
}

export class AdapterManager {
  private adapters = new Map<string, Adapter>();
  private _active: string | null = null;

  constructor(private queue: MessageQueue) {
    // Register CLI adapters that are available
    this.tryRegister('codex-cli', () => new CodexCliAdapter(queue), 'codex');
    this.tryRegister('claude-cli', () => new ClaudeCliAdapter(queue), 'claude');
  }

  private tryRegister(id: string, factory: () => Adapter, command?: string): void {
    if (command && !commandExists(command)) {
      console.warn(`[Adapters] Skipping ${id}: command '${command}' not found in PATH`);
      return;
    }
    try {
      const adapter = factory();
      this.adapters.set(id, adapter);
      if (!this._active) this._active = id;
      console.log(`[Adapters] Registered: ${id}`);
    } catch (err) {
      console.warn(`[Adapters] Could not register ${id}:`, err);
    }
  }

  /** Called by IpcServer when a VS Code extension connects */
  registerIpcAdapter(
    id: string,
    label: string,
    sendFn: (msg: unknown) => void
  ): void {
    const adapter = new IpcAdapter(id, label, sendFn);
    this.adapters.set(id, adapter);
    // VS Code adapters take priority
    this._active = id;
    console.log(`[Adapters] IPC adapter registered: ${id}`);
  }

  unregister(id: string): void {
    this.adapters.get(id)?.destroy();
    this.adapters.delete(id);
    if (this._active === id) {
      this._active = this.adapters.keys().next().value ?? null;
    }
  }

  list(): Array<{ id: string; label: string; active: boolean; available: boolean; reason: string | null }> {
    return [...this.adapters.values()].map((a) => ({
      id: a.id,
      label: a.label,
      active: a.id === this._active,
      available: a.isAvailable?.() ?? true,
      reason: a.unavailableReason?.() ?? null,
    }));
  }

  active(): string | null {
    return this._active;
  }

  setActive(id: string): void {
    if (!this.adapters.has(id)) throw new Error(`Unknown adapter: ${id}`);
    const adapter = this.adapters.get(id)!;
    if (adapter.isAvailable && !adapter.isAvailable()) {
      throw new Error(adapter.unavailableReason?.() ?? `Adapter unavailable: ${id}`);
    }
    this._active = id;
  }

  send(opts: SendOptions): void {
    const id = opts.tool ?? this._active;
    if (!id) {
      console.warn('[Adapters] No active adapter — message dropped');
      return;
    }
    const adapter = this.adapters.get(id);
    if (!adapter) {
      console.warn(`[Adapters] Adapter not found: ${id}`);
      return;
    }
    if (adapter.isAvailable && !adapter.isAvailable()) {
      console.warn(`[Adapters] Adapter unavailable: ${id}`);
      this.queue.emit({
        type: 'output',
        text: adapter.unavailableReason?.() ?? `Adapter unavailable: ${id}`,
        tool: id,
      });
      return;
    }
    adapter.send(opts);
  }

  async runAction(action: string, args: string[]): Promise<void> {
    const id = this._active;
    if (!id) throw new Error('No active adapter');
    const adapter = this.adapters.get(id)!;
    if (adapter.isAvailable && !adapter.isAvailable()) {
      throw new Error(adapter.unavailableReason?.() ?? `Adapter unavailable: ${id}`);
    }
    await adapter.runAction(action, args);
  }

  getPreviewUrl(): string | null {
    for (const adapter of this.adapters.values()) {
      const url = adapter.getPreviewUrl();
      if (url) return url;
    }
    return null;
  }
}
