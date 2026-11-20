/**
 * A tmux session name is generated exclusively by the VS Code host.
 * Never pass a mobile-supplied value directly to a shell or tmux command.
 */
export const MIRROR_SCREEN_LIMIT = 24000;
export const MIRROR_SESSION_PATTERN = /^vibridge_[0-9a-f]{32}$/;

export function validMirrorSession(name: unknown): name is string {
  return typeof name === 'string' && MIRROR_SESSION_PATTERN.test(name);
}

/** tmux capture-pane returns plain UTF-8 screen text (no ANSI attributes). */
export function boundedMirrorScreen(value: string): string {
  return value.replace(/\r/g, '').slice(-MIRROR_SCREEN_LIMIT);
}

/**
 * Send a single-line user message as literal UTF-8, then a separate real
 * Enter key to the owned tmux pane. No shell interpolation or code execution.
 *
 * Multiline/control input must use a different transport with bracketed-paste
 * semantics, never be silently interpreted as multiple Enter presses.
 */
export function ownedTmuxInputCommands(session: string, text: string, enter: boolean): string[][] {
  if (!validMirrorSession(session)) throw new Error('invalid_mirror_session');
  if (!text || text.length > 6000 || /[\x00-\x1f\x7f]/.test(text)) throw new Error('unsupported_tmux_input');
  return [
    ['send-keys','-l','-t',session,'--',text],
    ...(enter ? [['send-keys','-t',session,'Enter']] : []),
  ];
}
