/**
 * Route mobile terminal events by the exact live VS Code window and terminal.
 * A terminal name is never a safe routing key: many windows use "bash".
 */
export interface TerminalRouteRef {
  key: string
  windowId: string
  terminalId: string
  connected: boolean
}

export interface TerminalEventRef {
  type: string
  windowId?: unknown
  terminalId?: unknown
  tool?: unknown
}

export function routeTerminalEvent<T extends TerminalRouteRef>(
  message: TerminalEventRef,
  threads: T[],
): T | null {
  if (!['output', 'ide_event', 'notification', 'command_execution'].includes(message.type)) return null
  const windowId = typeof message.windowId === 'string' ? message.windowId : ''
  const terminalId = typeof message.terminalId === 'string' && message.terminalId
    ? message.terminalId
    : typeof message.tool === 'string' && message.tool.startsWith('terminal:')
      ? message.tool.slice('terminal:'.length)
      : ''
  if (!windowId || !terminalId) return null
  const matches = threads.filter(thread =>
    thread.connected && thread.windowId === windowId && thread.terminalId === terminalId,
  )
  return matches.length === 1 ? matches[0]! : null
}
