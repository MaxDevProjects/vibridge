/**
 * QR pairing links land on the UI root, including on phones.
 * Never redirect to /mobile before the invitation has been exchanged.
 */
export type PairingRouteQuery = Record<string, unknown>

function readParam(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0].trim()
  return ''
}

export function hasPairingInvitation(query: PairingRouteQuery): boolean {
  const relay = readParam(query.relay)
  const sessionId = readParam(query.sessionId)
  const code = readParam(query.code)
  const agentUrl = readParam(query.agentUrl)
  const host = readParam(query.host)
  const port = readParam(query.port)
  const preIssuedToken = readParam(query.token)

  if (relay === '1' && sessionId && /^\d{6}$/.test(code)) return true
  if (preIssuedToken && (agentUrl || (host && port))) return true
  if ((agentUrl || host) && /^\d{6}$/.test(code)) return true
  return false
}
