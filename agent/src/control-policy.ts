/**
 * Host-owned permissions. Never trust the mobile UI or relay to grant access.
 * A "control" session can still type into a shell with the OS user's rights.
 * Use a restricted OS account/container for real execution isolation.
 */
export type RemoteMode = 'observe' | 'control';

export interface AuthorizationResult {
  allowed: boolean;
  reason?: string;
}

export class ControlPolicy {
  readonly mode: RemoteMode;
  readonly allowedClis: ReadonlySet<string>;
  readonly allowTerminalClose: boolean;
  readonly allowWindowClose: boolean;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.mode = env.VIBRIDGE_REMOTE_MODE === 'control' ? 'control' : 'observe';
    this.allowedClis = new Set(
      (env.VIBRIDGE_ALLOWED_CLIS ?? 'codex,claude-code')
        .split(',').map(value => value.trim()).filter(Boolean),
    );
    this.allowTerminalClose = env.VIBRIDGE_ALLOW_TERMINAL_CLOSE === 'true';
    this.allowWindowClose = env.VIBRIDGE_ALLOW_WINDOW_CLOSE === 'true';
  }

  describe() {
    return {
      mode: this.mode,
      allowedClis: [...this.allowedClis],
      allowTerminalClose: this.allowTerminalClose,
      allowWindowClose: this.allowWindowClose,
      canControl: this.mode === 'control',
    };
  }

  authorize(type: string, fields: Record<string, unknown> = {}): AuthorizationResult {
    // Read-only operations remain usable when control is disabled.
    if (['list_projects', 'get_preview_url'].includes(type)) return { allowed: true };
    if (this.mode !== 'control') return { allowed: false, reason: 'remote_control_disabled' };

    if (type === 'start_cli') {
      const cliId = typeof fields.cliId === 'string' ? fields.cliId : '';
      return this.allowedClis.has(cliId)
        ? { allowed: true }
        : { allowed: false, reason: 'cli_not_allowlisted' };
    }
    if (type === 'kill_cli') {
      return this.allowTerminalClose
        ? { allowed: true }
        : { allowed: false, reason: 'terminal_close_disabled' };
    }
    // Preview is restricted further by the extension's user-level port allowlist.
    if (type === 'preview_capture') return { allowed: true };
    if (type === 'close_window') {
      return this.allowWindowClose ? { allowed: true } : { allowed: false, reason: 'window_close_disabled' };
    }
    if (['message', 'chat', 'create_terminal', 'focus_terminal', 'open_project', 'adapter_toggle'].includes(type)) {
      return { allowed: true };
    }
    // No generic arbitrary actions, remote CLI definitions, remote pairing or
    // fake approvals. These must be managed locally on the host.
    return { allowed: false, reason: 'action_not_permitted' };
  }
}
