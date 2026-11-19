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
