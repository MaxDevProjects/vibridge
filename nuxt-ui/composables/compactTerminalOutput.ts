/**
 * Best-effort human-readable interpretation of incomplete terminal output.
 * Never use this as evidence that a CLI has finished or approved an action.
 */
const ANSI = /\u001b(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001b\\)|[78DEHM])/g
const SPINNER = /^[\s\-\|\\\/⠁-⣿⣀-⣿●○◌◐◓◑◒·.]+$/
const PROGRESS = /^(working|thinking|processing|loading|analyzing|running|en cours|réflexion)(?:\s|[.:…]|$)/i

export interface CompactOutput {
  display: string
  working: boolean
}

/** Rebuild the final visible line after carriage-return rewrites. */
export function compactTerminalOutput(raw: string, limit = 1800): CompactOutput {
  const clean = raw.replace(ANSI, '').replace(/\u001b/g, '').replace(/\r\n/g, '\n')
  const lines = clean.split('\n').map(line => line.split('\r').at(-1) ?? '')
  const useful = lines.map(line => line.trimEnd()).filter(line => {
    const t = line.trim()
    return Boolean(t) && !SPINNER.test(t) && !PROGRESS.test(t)
  })
  const display = useful.slice(-12).join('\n').slice(-limit)
  const tail = lines.slice(-6).join(' ').trim()
  return { display, working: PROGRESS.test(tail) || (Boolean(tail) && SPINNER.test(tail)) }
}

/** A chat thread is scoped to a live VS Code window and an actual terminal ID. */
export function terminalConversationKey(session: string, workspace: string, windowId: string, terminalId: string): string {
  return JSON.stringify([session, workspace, windowId, terminalId])
}
