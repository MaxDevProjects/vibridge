/**
 * Conservative reconnection: a terminal's name is not an identity.
 * Restore only when both sides have the same live OS process ID and project
 * path, and when exactly one compatible old thread and one live successor exist.
 */
export interface TerminalThreadIdentity {
  key: string
  projectPath: string
  label: string
  processId?: number
  connected: boolean
  recoveredTo?: string
  lastSeen?: number
}

export function findRestorableThread<T extends TerminalThreadIdentity>(
  current: T,
  known: T[],
  live: T[],
  hasHistory: (key: string) => boolean,
): string | null {
  if (!current.connected || !Number.isSafeInteger(current.processId) || Number(current.processId) <= 0 || !current.projectPath) return null
  const matches = (other: TerminalThreadIdentity) =>
    other.projectPath === current.projectPath
    && other.label === current.label
    && other.processId === current.processId
  if (live.filter(matches).length !== 1) return null
  const now = Date.now()
  const candidates = known.filter(previous =>
    previous.key !== current.key
    && matches(previous)
    && !live.some(thread => thread.key === previous.key)
    && (!previous.lastSeen || now - previous.lastSeen < 24 * 60 * 60 * 1000)
    && !previous.recoveredTo
    && hasHistory(previous.key),
  )
  return candidates.length === 1 ? candidates[0]!.key : null
}
