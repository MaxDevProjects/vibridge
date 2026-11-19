import http from 'http'
import { randomUUID } from 'crypto'
import express, { Request, Response, NextFunction } from 'express'
import { WebSocketServer, WebSocket, RawData } from 'ws'
import { RelayAuth } from './auth'
import { RelayStore } from './store'
import type { ConnectedWorkspace, RelayRole, RelaySession, SessionClaims } from './types'

interface RelayServerOptions {
  port: number
  publicBaseUrl: string
  uiBaseUrl: string
  auth: RelayAuth
  store: RelayStore
  sessionTtlMs: number
}

interface AuthenticatedSocket extends WebSocket {
  claims?: SessionClaims
  token?: string
  expiryTimer?: NodeJS.Timeout
  alive?: boolean
  workspaceId?: string
  workspaceName?: string
  workspacePath?: string
}

interface SessionPeers {
  mobiles: Set<AuthenticatedSocket>
  agents: Map<string, AuthenticatedSocket>
  activeWorkspaceId: string | null
}

const MOBILE_COMMANDS = new Set([
  'message', 'chat', 'adapter_toggle', 'action', 'notif_response',
  'open_project', 'list_projects', 'get_preview_url', 'get_pairing_code',
  'focus_terminal', 'create_terminal', 'reopen_terminal', 'start_cli', 'kill_cli', 'close_window', 'preview_capture',
])

const COMMAND_FIELDS = [
  'id', 'active', 'action', 'args', 'path', 'projectPath', 'newWindow',
  'terminalName', 'terminalId', 'cliId', 'sendEnter', 'windowId', 'port', 'device', 'mirror', 'session',
] as const

const AGENT_RESPONSE_TYPES = new Set(['relay_file_response', 'relay_clis_response', 'relay_push_response', 'relay_command_ack'])

interface PendingAgentRequest {
  socket: AuthenticatedSocket
  responseType: string
  resolve: (payload: Record<string, unknown>) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export function createRelayServer(options: RelayServerOptions) {
  const app = express()
  const { auth, store, publicBaseUrl, uiBaseUrl, sessionTtlMs } = options
  const peers = new Map<string, SessionPeers>()
  const pendingAgentRequests = new Map<string, PendingAgentRequest>()

  app.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    if (_req.method === 'OPTIONS') {
      res.status(204).end()
      return
    }
    next()
  })
  app.use(express.json())
  app.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    next()
  })

  function bearer(req: Request): string {
    return /^Bearer (\S+)$/i.exec(req.headers.authorization ?? '')?.[1] ?? ''
  }

  function liveSession(sessionId: string): RelaySession | null {
    const session = store.getSession(sessionId, false)
    return session && session.status !== 'closed' && session.expiresAt > Date.now() ? session : null
  }

  function sessionCredential(token: string, claims = auth.verify(token)): SessionClaims | null {
    if (!claims || claims.role === 'setup' || claims.exp * 1000 <= Date.now()) return null
    const session = liveSession(claims.sessionId)
    const expected = claims.role === 'mobile' ? session?.mobileToken : session?.agentToken
    return expected && expected === token ? claims : null
  }

  function sessionMetadata(body: unknown) {
    const fields = body && typeof body === 'object' ? body as Record<string, unknown> : {}
    const optionalString = (value: unknown) => typeof value === 'string' ? value.trim().slice(0, 512) || undefined : undefined
    return {
      label: optionalString(fields.label),
      workspaceId: optionalString(fields.workspaceId),
      workspaceFolders: Array.isArray(fields.workspaceFolders)
        ? fields.workspaceFolders.slice(0, 32).flatMap(folder => optionalString(folder) ?? [])
        : undefined,
    }
  }

  function buildQrUrl(sessionId: string, pairingCode: string): string {
    const url = new URL('/', uiBaseUrl.replace(/\/$/, '') || publicBaseUrl)
    url.searchParams.set('relay', '1')
    url.searchParams.set('relayUrl', publicBaseUrl)
    url.searchParams.set('sessionId', sessionId)
    url.searchParams.set('code', pairingCode)
    return url.toString()
  }

  const requireSessionAuth = (allowedRoles: RelayRole[] = ['mobile', 'agent']) =>
    (req: Request, res: Response, next: NextFunction) => {
      const claims = sessionCredential(bearer(req))
      if (!claims || !allowedRoles.includes(claims.role)) {
        res.status(401).json({ error: 'unauthorized' })
        return
      }
      ;(req as Request & { claims?: SessionClaims }).claims = claims
      next()
    }

  function resolveSetupClaims(req: Request): SessionClaims | null {
    const claims = auth.verify(bearer(req))
    if (!claims || claims.role !== 'setup') return null
    return claims
  }

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' })
  })

  app.get('/workspaces', requireSessionAuth(), (req, res) => {
    const { sessionId } = (req as Request & { claims: SessionClaims }).claims
    res.json(listConnectedWorkspaces(sessionId))
  })

  app.get('/api/relay/sessions', requireSessionAuth(), (req, res) => {
    const { sessionId } = (req as Request & { claims: SessionClaims }).claims
    const session = liveSession(sessionId)!
    const sessionPeers = peers.get(sessionId)
    res.json({ sessions: [{
      id: session.id,
      workspaceId: session.workspaceId ?? session.label ?? session.id,
      label: session.label ?? session.workspaceId ?? session.id,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      status: session.status,
      agentConnected: Boolean(sessionPeers?.agents.size),
      mobileConnected: Boolean(sessionPeers?.mobiles.size),
      workspaces: listConnectedWorkspaces(session.id),
    }] })
  })

  app.post('/api/relay/sessions', (req, res) => {
    const { label, workspaceId, workspaceFolders } = sessionMetadata(req.body)
    const expiresAt = Date.now() + sessionTtlMs
    const session = store.createSession({
      label,
      workspaceId,
      workspaceFolders,
      agentToken: '',
      expiresAt,
    })
    const finalAgentToken = auth.issueSessionToken(session.id, 'agent', session.expiresAt)
    store.updateSessionTokens(session.id, { agentToken: finalAgentToken })

    res.json({
      sessionId: session.id,
      workspaceId: session.workspaceId ?? null,
      pairingCode: session.pairingCode,
      agentToken: finalAgentToken,
      expiresAt: session.expiresAt,
      relayUrl: publicBaseUrl,
      qrUrl: buildQrUrl(session.id, session.pairingCode),
    })
  })

  app.post('/api/onboarding/session', (req, res) => {
    const { label, workspaceId, workspaceFolders } = sessionMetadata(req.body)
    const expiresAt = Date.now() + sessionTtlMs
    const session = store.createSession({
      label,
      workspaceId,
      workspaceFolders,
      agentToken: '',
      expiresAt,
    })
    const setupToken = auth.issueSessionToken(session.id, 'setup', Math.min(session.expiresAt, Date.now() + 600_000))
    const vscodeUri = `vscode://devbridge.devbridge/onboarding?setupToken=${encodeURIComponent(setupToken)}`

    res.json({
      sessionId: session.id,
      setupToken,
      pairingCode: session.pairingCode,
      expiresAt: session.expiresAt,
      relayUrl: publicBaseUrl,
      qrUrl: buildQrUrl(session.id, session.pairingCode),
      vscodeUri,
    })
  })

  app.get('/api/onboarding/agent-status', (req, res) => {
    const claims = resolveSetupClaims(req)
    if (!claims) {
      res.status(401).json({ error: 'unauthorized' })
      return
    }
    const session = liveSession(claims.sessionId)
    if (!session) {
      res.status(404).json({ error: 'not found' })
      return
    }
    const sessionPeers = peers.get(session.id)
    res.json({
      sessionId: session.id,
      status: session.status,
      pairingCode: session.status === 'waiting' ? session.pairingCode : null,
      expiresAt: session.expiresAt,
      relayUrl: publicBaseUrl,
      qrUrl: session.status === 'waiting' ? buildQrUrl(session.id, session.pairingCode) : null,
      agentConnected: Boolean(sessionPeers?.agents.size),
      mobileConnected: Boolean(sessionPeers?.mobiles.size),
    })
  })

  app.post('/api/onboarding/claim', (req, res) => {
    const setupToken = req.body?.setupToken
    const claims = typeof setupToken === 'string' ? auth.verify(setupToken) : null
    if (!claims || claims.role !== 'setup') {
      res.status(401).json({ error: 'unauthorized' })
      return
    }
    const session = liveSession(claims.sessionId)
    if (!session) {
      res.status(404).json({ error: 'not found' })
      return
    }
    const nextAgentToken = auth.issueSessionToken(session.id, 'agent', session.expiresAt)
    const claimed = store.claimSetup(session.id, nextAgentToken, sessionMetadata(req.body))
    if (!claimed) {
      res.status(409).json({ error: 'setup already claimed' })
      return
    }
    res.json({
      sessionId: claimed.id,
      pairingCode: claimed.pairingCode,
      agentToken: nextAgentToken,
      expiresAt: claimed.expiresAt,
      relayUrl: publicBaseUrl,
      qrUrl: buildQrUrl(claimed.id, claimed.pairingCode),
    })
  })

  const pairingAttempts = new Map<string, { count: number; until: number }>()
  const sweepAttempts = setInterval(() => {
    for (const [id, limit] of pairingAttempts) {
      if (limit.until <= Date.now()) pairingAttempts.delete(id)
    }
  }, 60_000).unref()

  app.post('/api/relay/pair', (req, res) => {
    const { sessionId, pairingCode } = req.body as { sessionId?: string; pairingCode?: string }
    if (typeof sessionId !== 'string' || typeof pairingCode !== 'string' || !/^\d{6}$/.test(pairingCode)) {
      res.status(400).json({ error: 'missing sessionId or pairingCode' })
      return
    }
    const waiting = liveSession(sessionId)
    if (!waiting || !waiting.agentToken) {
      res.status(403).json({ error: 'invalid or expired pairing' })
      return
    }
    const now = Date.now()
    let limit = pairingAttempts.get(sessionId)
    if (!limit || limit.until <= now) {
      limit = { count: 0, until: now + 60_000 }
      pairingAttempts.set(sessionId, limit)
    }
    if (limit.count >= 10) {
      res.status(429).json({ error: 'too many pairing attempts' })
      return
    }
    limit.count++
    const mobileToken = auth.issueSessionToken(sessionId, 'mobile', waiting.expiresAt)
    const session = store.pair(sessionId, pairingCode, mobileToken)
    if (!session) {
      res.status(403).json({ error: 'invalid or expired pairing' })
      return
    }
    pairingAttempts.delete(sessionId)
    for (const socket of peers.get(sessionId)?.mobiles ?? []) {
      socket.close(4401, 'mobile credential replaced')
    }
    res.json({
      sessionId: session.id,
      mobileToken,
      expiresAt: session.expiresAt,
      relayUrl: publicBaseUrl,
    })
  })

  // An already authorized device may explicitly invite a replacement device.
  // The existing pair endpoint still rotates the single mobile credential.
  app.post('/api/relay/pairing-code', requireSessionAuth(['agent', 'mobile']), (req, res) => {
    const { sessionId } = (req as Request & { claims: SessionClaims }).claims
    const pairingCode = store.renewPairingCode(sessionId)
    if (!pairingCode) {
      res.status(404).json({ error: 'not found' })
      return
    }
    pairingAttempts.delete(sessionId)
    res.json({ pairingCode, qrUrl: buildQrUrl(sessionId, pairingCode) })
  })

  // Browser sign-out is not revocation: invalidate every bearer and live socket.
  app.delete('/api/relay/sessions/:sessionId', requireSessionAuth(['mobile', 'agent']), (req, res) => {
    const claims = (req as Request & { claims: SessionClaims }).claims
    if (claims.sessionId !== req.params.sessionId) {
      res.status(403).json({ error: 'forbidden' })
      return
    }
    if (!store.revokeSession(claims.sessionId)) {
      res.status(404).json({ error: 'session already closed' })
      return
    }
    const sessionPeers = peers.get(claims.sessionId)
    if (sessionPeers) {
      for (const mobile of sessionPeers.mobiles) mobile.close(4401, 'session revoked')
      for (const agent of sessionPeers.agents.values()) agent.close(4401, 'session revoked')
      peers.delete(claims.sessionId)
    }
    res.status(204).end()
  })

  app.get('/api/relay/sessions/:sessionId', requireSessionAuth(['mobile', 'agent']), (req, res) => {
    const sessionId = req.params.sessionId
    const claims = (req as Request & { claims?: SessionClaims }).claims!
    if (claims.sessionId !== sessionId) {
      res.status(403).json({ error: 'forbidden' })
      return
    }
    const session = store.getSession(sessionId)
    if (!session) {
      res.status(404).json({ error: 'not found' })
      return
    }
    const sessionPeers = peers.get(sessionId)
    res.json({
      id: session.id,
      workspaceId: session.workspaceId ?? null,
      status: session.status,
      label: session.label ?? null,
      workspaceFolders: session.workspaceFolders,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      agentConnected: Boolean(sessionPeers?.agents.size),
      mobileConnected: Boolean(sessionPeers?.mobiles.size),
      workspaces: listConnectedWorkspaces(session.id),
      workspaceSnapshots: listWorkspaceSnapshots(session.id),
      history: session.history,
    })
  })

  app.get('/api/relay/sessions/:sessionId/files', requireSessionAuth(['mobile']), async (req, res) => {
    const sessionId = req.params.sessionId
    const claims = (req as Request & { claims?: SessionClaims }).claims!
    if (claims.sessionId !== sessionId) {
      res.status(403).json({ error: 'forbidden' })
      return
    }

    const workspaceId = requestedWorkspace(req)
    const windowId = typeof req.query.windowId === 'string' ? req.query.windowId.trim() : ''
    const filePath = String(req.query.path ?? '').trim()

    if (windowId && !/^[a-zA-Z0-9-]{1,80}$/.test(windowId)) {
      res.status(400).json({ error: 'invalid windowId' })
      return
    }
    if (!filePath && windowId) {
      try {
        const response = await requestAgentPayload(sessionId, workspaceId, 'relay_file_request', {
          path: '', windowId, list: true,
        })
        if (typeof response.error === 'string') {
          res.status(409).json({ error: response.error })
          return
        }
        res.json({ tree: Array.isArray(response.tree) ? response.tree : [] })
      } catch {
        res.status(503).json({ error: 'window unavailable' })
      }
      return
    }

    if (!filePath) {
      const snapshot = workspaceId
        ? store.getWorkspaceSnapshot(sessionId, workspaceId)
        : (() => {
            const agent = resolveTargetAgent(sessionId)
            return agent?.workspaceId ? store.getWorkspaceSnapshot(sessionId, agent.workspaceId) : null
          })()
      res.json({ tree: snapshot?.fileTree ?? [] })
      return
    }

    try {
      const response = await requestAgentPayload(sessionId, workspaceId, 'relay_file_request', {
        path: filePath, windowId,
      })
      if (typeof response.error === 'string') {
        res.status(404).json({ error: response.error })
        return
      }
      res.json({
        path: String(response.path ?? filePath),
        content: String(response.content ?? ''),
      })
    } catch (error) {
      res.status(503).json({ error: error instanceof Error ? error.message : 'relay file request failed' })
    }
  })

  function requestedWorkspace(req: Request): string | undefined {
    return typeof req.query.workspaceId === 'string' ? req.query.workspaceId.trim() || undefined : undefined
  }

  // Web Push is registered at the local agent but reachable through the relay.
  // The relay does not store subscriptions or VAPID secrets.
  app.get('/push/public-key', requireSessionAuth(['mobile']), async (req, res) => {
    const claims = (req as Request & { claims: SessionClaims }).claims
    try {
      const result = await requestAgentPayload(claims.sessionId, requestedWorkspace(req), 'relay_push_request', { action: 'public_key' })
      if (result.error) { res.status(502).json({ error: result.error }); return }
      res.json({ publicKey: result.publicKey ?? '' })
    } catch { res.status(503).json({ error: 'agent unavailable' }) }
  })
  app.post('/push/subscribe', requireSessionAuth(['mobile']), async (req, res) => {
    const claims = (req as Request & { claims: SessionClaims }).claims
    try {
      const result = await requestAgentPayload(claims.sessionId, requestedWorkspace(req), 'relay_push_request', { action: 'subscribe', subscription: req.body })
      res.status(result.ok === true ? 200 : 400).json(result)
    } catch { res.status(503).json({ error: 'agent unavailable' }) }
  })
  app.post('/push/unsubscribe', requireSessionAuth(['mobile']), async (req, res) => {
    const claims = (req as Request & { claims: SessionClaims }).claims
    if (typeof req.body?.endpoint !== 'string') { res.status(400).json({ error: 'endpoint required' }); return }
    try {
      const result = await requestAgentPayload(claims.sessionId, requestedWorkspace(req), 'relay_push_request', { action: 'unsubscribe', endpoint: req.body.endpoint })
      res.status(result.ok === true ? 200 : 400).json(result)
    } catch { res.status(503).json({ error: 'agent unavailable' }) }
  })

  // ── CLI Registry proxy (forwarded to agent via WebSocket) ──────────
  app.get('/clis', requireSessionAuth(['mobile']), async (req, res) => {
    const claims = (req as Request & { claims?: SessionClaims }).claims!
    try {
      const response = await requestAgentPayload(claims.sessionId, requestedWorkspace(req), 'relay_clis_request', { action: 'list' })
      if (typeof response.error === 'string') {
        res.status(502).json({ error: response.error })
        return
      }
      res.json({ clis: response.clis ?? [] })
    } catch (error) {
      res.status(503).json({ error: error instanceof Error ? error.message : 'agent unavailable' })
    }
  })

  app.post('/clis/detect', requireSessionAuth(['mobile']), async (req, res) => {
    const claims = (req as Request & { claims?: SessionClaims }).claims!
    try {
      const response = await requestAgentPayload(claims.sessionId, requestedWorkspace(req), 'relay_clis_request', { action: 'detect' })
      if (typeof response.error === 'string') {
        res.status(502).json({ error: response.error })
        return
      }
      res.json({ clis: response.clis ?? [] })
    } catch (error) {
      res.status(503).json({ error: error instanceof Error ? error.message : 'agent unavailable' })
    }
  })

  // CLI executable definitions and defaults are host-owned. The public relay
  // must never be able to reconfigure which commands a workstation trusts.
  app.post('/clis/default', requireSessionAuth(['mobile']), (_req, res) => {
    res.status(403).json({ error: 'CLI configuration must be changed in VS Code User settings' })
  })
  app.post('/clis/custom', requireSessionAuth(['mobile']), (_req, res) => {
    res.status(403).json({ error: 'CLI configuration must be changed in VS Code User settings' })
  })
  app.delete('/clis/:id', requireSessionAuth(['mobile']), (_req, res) => {
    res.status(403).json({ error: 'CLI configuration must be changed in VS Code User settings' })
  })

  const httpServer = http.createServer(app)
  const wss = new WebSocketServer({ server: httpServer, path: '/ws', maxPayload: 4 * 1024 * 1024 })
  wss.on('close', () => clearInterval(sweepAttempts))

  function getSessionPeers(sessionId: string): SessionPeers {
    const sessionPeers = peers.get(sessionId)
    if (sessionPeers) return sessionPeers
    const next: SessionPeers = {
      mobiles: new Set(),
      agents: new Map<string, AuthenticatedSocket>(),
      activeWorkspaceId: null,
    }
    peers.set(sessionId, next)
    return next
  }

  function listConnectedWorkspaces(sessionId: string): ConnectedWorkspace[] {
    const sessionPeers = peers.get(sessionId)
    const connected = sessionPeers
      ? Array.from(sessionPeers.agents.entries()).map(([workspaceId, socket]) => ({
          id: workspaceId,
          name: socket.workspaceName || workspaceId,
          path: socket.workspacePath,
          active: sessionPeers.activeWorkspaceId === workspaceId,
          connected: socket.readyState === WebSocket.OPEN,
        }))
      : []
    const byId = new Map(connected.map(workspace => [workspace.id, workspace]))
    for (const workspace of store.listWorkspaces(sessionId)) {
      if (byId.has(workspace.id)) continue
      byId.set(workspace.id, {
        id: workspace.id,
        name: workspace.name,
        path: workspace.path,
        active: false,
        connected: false,
      })
    }
    return Array.from(byId.values())
  }

  function listWorkspaceSnapshots(sessionId: string) {
    return store.listWorkspaceSnapshots(sessionId)
  }

  function updateWorkspaceSnapshot(
    sessionId: string,
    workspaceId: string,
    payload: Record<string, unknown>,
  ) {
    store.upsertWorkspaceSnapshot(sessionId, workspaceId, payload)
  }

  async function requestAgentPayload(
    sessionId: string,
    workspaceId: string | undefined,
    type: string,
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const target = resolveTargetAgent(sessionId, workspaceId)
    if (!target) throw new Error('workspace unavailable')
    const responseType = type === 'relay_file_request' ? 'relay_file_response'
      : type === 'relay_push_request' ? 'relay_push_response' : 'relay_clis_response'
    return requestFromAgent(target, responseType, { type, ...payload, workspace_id: target.workspaceId })
  }

  function sendFrame(socket: AuthenticatedSocket, payload: unknown): boolean {
    if (socket.readyState !== WebSocket.OPEN) return false
    if (socket.bufferedAmount > 4 * 1024 * 1024) {
      socket.terminate()
      return false
    }
    socket.send(JSON.stringify(payload))
    return true
  }

  function requestFromAgent(
    socket: AuthenticatedSocket,
    responseType: string,
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (pendingAgentRequests.size >= 256) return Promise.reject(new Error('relay busy'))
    const requestId = randomUUID()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingAgentRequests.delete(requestId)
        reject(new Error('agent request timeout'))
      }, 5_000)
      pendingAgentRequests.set(requestId, { socket, responseType, resolve, reject, timer })
      if (!sendFrame(socket, { ...payload, request_id: requestId })) {
        clearTimeout(timer)
        pendingAgentRequests.delete(requestId)
        reject(new Error('agent disconnected'))
      }
    })
  }

  function broadcastPeerStatus(sessionId: string) {
    const sessionPeers = peers.get(sessionId)
    if (!sessionPeers) return
    const payload = {
      type: 'peer_status',
      agentConnected: sessionPeers.agents.size > 0,
      mobileConnected: sessionPeers.mobiles.size > 0,
    }
    for (const peer of sessionPeers.mobiles) sendFrame(peer, payload)
    for (const peer of sessionPeers.agents.values()) sendFrame(peer, payload)
  }

  function sendWorkspaceEvent(sessionId: string, payload: Record<string, unknown>) {
    for (const mobile of peers.get(sessionId)?.mobiles ?? []) sendFrame(mobile, payload)
  }

  function registerAgentWorkspace(ws: AuthenticatedSocket, workspaceId: string, workspaceName: string, workspacePath?: string) {
    if (!ws.claims) return
    const sessionPeers = getSessionPeers(ws.claims.sessionId)
    const normalizedWorkspaceId = workspaceId.trim()
    if (!normalizedWorkspaceId) return

    if (ws.workspaceId && ws.workspaceId !== normalizedWorkspaceId) {
      ws.close(1008, 'workspace cannot change on an existing connection')
      return
    }

    const previous = sessionPeers.agents.get(normalizedWorkspaceId)
    if (previous === ws) return
    previous?.close(4410, 'workspace connection replaced')

    ws.workspaceId = normalizedWorkspaceId
    ws.workspaceName = workspaceName || normalizedWorkspaceId
    ws.workspacePath = workspacePath

    sessionPeers.agents.delete(normalizedWorkspaceId)
    sessionPeers.agents.set(normalizedWorkspaceId, ws)
    sessionPeers.activeWorkspaceId = normalizedWorkspaceId
    store.upsertWorkspace(ws.claims.sessionId, {
      id: normalizedWorkspaceId,
      name: ws.workspaceName,
      path: ws.workspacePath,
    })

    sendWorkspaceEvent(ws.claims.sessionId, {
      type: 'workspace_connected',
      workspace_id: normalizedWorkspaceId,
      workspace_name: ws.workspaceName,
    })
    broadcastPeerStatus(ws.claims.sessionId)
  }

  function resolveTargetAgent(sessionId: string, requestedWorkspaceId?: string): AuthenticatedSocket | null {
    const sessionPeers = peers.get(sessionId)
    if (!sessionPeers) return null
    const available = [...sessionPeers.agents.values()].filter(socket => socket.readyState === WebSocket.OPEN)
    if (requestedWorkspaceId !== undefined) {
      return available.find(socket => socket.workspaceId === requestedWorkspaceId) ?? null
    }
    return available.length === 1 ? available[0]! : null
  }

  async function forwardMobileCommand(sessionId: string, ws: AuthenticatedSocket, msg: Record<string, unknown>) {
    const id = typeof msg.request_id === 'string' && msg.request_id.length <= 128 ? msg.request_id : undefined
    const reply = (status: 'received' | 'rejected' | 'unconfirmed', reason?: string) => {
      sendFrame(ws, { type: 'message_ack', request_id: id, status, reason })
    }
    const type = String(msg.type)
    if (!MOBILE_COMMANDS.has(type)) return reply('rejected', 'unsupported_command')
    const requested = msg.workspace_id ?? msg.workspaceId
    if (requested !== undefined && (typeof requested !== 'string' || !requested.trim())) {
      return reply('rejected', 'workspace_unavailable')
    }
    const agent = resolveTargetAgent(sessionId, typeof requested === 'string' ? requested.trim() : undefined)
    if (!agent) return reply('rejected', 'workspace_unavailable')
    const readOnly = type === 'list_projects' || type === 'get_preview_url' || type === 'get_pairing_code'
    if (!readOnly) {
      if (!id) return reply('rejected', 'request_id_required')
      // SQLite reservation is atomic and persists across relay restarts.
      // Never release on delivery timeout: execution may already have begun.
      if (!store.reserveRemoteCommand(sessionId, id)) {
        return reply('unconfirmed', 'duplicate_request_not_replayed')
      }
    }

    const original = msg.payload && typeof msg.payload === 'object' && !Array.isArray(msg.payload)
      ? msg.payload as Record<string, unknown>
      : {}
    const command = Object.fromEntries(COMMAND_FIELDS.map(field => [field, msg[field] ?? original[field]]))
    const data = {
      type,
      workspaceId: agent.workspaceId,
      target: typeof msg.target === 'string' ? msg.target : undefined,
      tool: typeof msg.tool === 'string' ? msg.tool : undefined,
      text: typeof msg.text === 'string' ? msg.text : undefined,
      payload: command,
    }
    try {
      const response = await requestFromAgent(agent, 'relay_command_ack', {
        ...data, source: 'mobile', sessionId,
      })
      if (response.ok !== true) return reply('rejected', 'agent_rejected')
      if (type === 'chat' || type === 'message') store.append(sessionId, 'mobile', data)
      reply('received')
    } catch {
      reply('unconfirmed', 'agent_response_unavailable')
    }
  }

  const heartbeat = setInterval(() => {
    for (const socket of wss.clients as Set<AuthenticatedSocket>) {
      if (!socket.alive) socket.terminate()
      else if (socket.readyState === WebSocket.OPEN) {
        socket.alive = false
        socket.ping()
      }
    }
  }, 20_000).unref()
  wss.on('close', () => clearInterval(heartbeat))

  wss.on('connection', (ws: AuthenticatedSocket) => {
    ws.alive = true
    ws.on('pong', () => { ws.alive = true })
    const authenticationDeadline = setTimeout(() => ws.close(4401, 'authentication timeout'), 5_000)
    ws.on('error', () => ws.terminate())
    ws.on('message', (raw: RawData) => {
      let msg: Record<string, unknown>
      try {
        msg = JSON.parse(raw.toString()) as Record<string, unknown>
      } catch {
        ws.close(1008, 'bad json')
        return
      }

      if (!msg || typeof msg !== 'object' || Array.isArray(msg) || typeof msg.type !== 'string') {
        ws.close(1008, 'invalid message')
        return
      }

      if (!ws.claims) {
        if (msg.type !== 'auth' || typeof msg.token !== 'string') {
          ws.close(4401, 'unauthorized')
          return
        }
        const claims = sessionCredential(msg.token)
        if (!claims) {
          ws.close(4401, 'unauthorized')
          return
        }
        const session = store.getSession(claims.sessionId)
        if (!session) {
          ws.close(4404, 'session not found')
          return
        }
        clearTimeout(authenticationDeadline)
        ws.token = msg.token
        ws.claims = claims
        const closeOnExpiry = () => {
          const remaining = Math.min(session.expiresAt, claims.exp * 1000) - Date.now()
          if (remaining <= 0) ws.close(4401, 'session expired')
          else ws.expiryTimer = setTimeout(closeOnExpiry, Math.min(remaining, 2_147_483_647))
        }
        closeOnExpiry()
        const sessionPeers = getSessionPeers(claims.sessionId)
        if (claims.role === 'mobile') {
          sessionPeers.mobiles.add(ws)
        }
        sendFrame(ws, {
          type: 'auth_ok',
          role: claims.role,
          sessionId: claims.sessionId,
          workspaces: listConnectedWorkspaces(claims.sessionId),
          history: claims.role === 'mobile' ? session.history : [],
        })
        broadcastPeerStatus(claims.sessionId)
        return
      }

      if (!sessionCredential(ws.token!, ws.claims)) {
        ws.close(4401, 'session expired or revoked')
        return
      }
      const { sessionId, role } = ws.claims
      if (role === 'mobile') {
        void forwardMobileCommand(sessionId, ws, msg)
        return
      }

      if (msg.type === 'agent_hello') {
        const workspaceId = typeof msg.workspace_id === 'string' ? msg.workspace_id : ''
        if (!workspaceId.trim() || workspaceId.length > 512) return
        registerAgentWorkspace(
          ws,
          workspaceId,
          typeof msg.workspace_name === 'string' ? msg.workspace_name : workspaceId,
          typeof msg.workspace_path === 'string' ? msg.workspace_path : undefined,
        )
        return
      }

      if (!ws.workspaceId || peers.get(sessionId)?.agents.get(ws.workspaceId) !== ws) return
      if (AGENT_RESPONSE_TYPES.has(String(msg.type))) {
        if (typeof msg.request_id !== 'string') return
        const pending = pendingAgentRequests.get(msg.request_id)
        if (!pending || pending.socket !== ws || pending.responseType !== msg.type) return
        clearTimeout(pending.timer)
        pendingAgentRequests.delete(msg.request_id)
        pending.resolve(msg)
        return
      }

      // Live terminal screen is sensitive ephemeral state. Never persist it in
      // SQLite history, logs, or a workspace snapshot.
      if (msg.type === 'terminal_screen') {
        const terminalId = typeof msg.terminalId === 'string' ? msg.terminalId : ''
        const windowId = typeof msg.windowId === 'string' ? msg.windowId : ''
        const screen = typeof msg.text === 'string' ? msg.text : ''
        if (terminalId && windowId && screen.length <= 24_000) {
          sendWorkspaceEvent(sessionId, {
            type: 'terminal_screen',
            workspaceId: ws.workspaceId,
            windowId, terminalId,
            text: screen,
            ts: typeof msg.ts === 'number' ? msg.ts : Date.now(),
          })
        }
        return
      }

      const eventFields = ['event', 'url', 'path', 'terminalName', 'terminalId', 'mirrorSession', 'request_id', 'phase', 'action', 'reason', 'state', 'isQuestion', 'direction', 'clis', 'windowId']
      const extras = Object.fromEntries(eventFields.filter(field => msg[field] !== undefined).map(field => [field, msg[field]]))
      let payload = Object.keys(extras).length ? {
        ...(msg.payload && typeof msg.payload === 'object' && !Array.isArray(msg.payload) ? msg.payload : {}),
        ...extras,
      } : msg.payload
      if (msg.type === 'status_snapshot' || msg.type === 'relay_session') {
        const state = (payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {}) as Record<string, unknown>
        const safeRelay = (value: unknown) => {
          const relay = value && typeof value === 'object' ? value as Record<string, unknown> : {}
          return {
            enabled: relay.enabled,
            relayUrl: relay.relayUrl,
            sessionId,
            expiresAt: relay.expiresAt,
            status: relay.status,
            connected: relay.connected,
            agentConnected: relay.agentConnected,
            mobileConnected: relay.mobileConnected,
          }
        }
        payload = msg.type === 'relay_session' ? safeRelay(state) : { ...state, relay: safeRelay(state.relay) }
        if (msg.type === 'status_snapshot') {
          updateWorkspaceSnapshot(sessionId, ws.workspaceId, payload as Record<string, unknown>)
          sendWorkspaceEvent(sessionId, { type: 'status_snapshot', workspaceId: ws.workspaceId, payload })
          return
        }
      }

      // IDE/project updates are live state, not conversation history. Persist
      // one current snapshot per workspace without evicting genuine chat output.
      if (msg.type === 'ide_snapshot' && payload && typeof payload === 'object' && !Array.isArray(payload)) {
        const state = (payload as Record<string, unknown>).state
        if (state && typeof state === 'object' && !Array.isArray(state)) {
          const ide = state as Record<string, unknown>
          store.upsertWorkspaceSnapshot(sessionId, ws.workspaceId, {
            ideState: ide,
            timestamp: typeof ide.updatedAt === 'number' ? ide.updatedAt : Date.now(),
          })
          sendWorkspaceEvent(sessionId, { type: 'ide_snapshot', workspaceId: ws.workspaceId,
            state: ide, windowId: typeof ide.windowId === 'string' ? ide.windowId : (payload as Record<string, unknown>).windowId,
            payload: { state: ide } })
        }
        return
      }
      if (msg.type === 'windows_update') {
        const windows = Array.isArray(msg.windows) ? msg.windows : []
        const focusedWindowId = typeof msg.focusedWindowId === 'string' ? msg.focusedWindowId : ''
        store.upsertWorkspaceSnapshot(sessionId, ws.workspaceId, {
          windows, focusedWindowId, timestamp: Date.now(),
        })
        sendWorkspaceEvent(sessionId, { type: 'windows_update', workspaceId: ws.workspaceId, windows, focusedWindowId })
        return
      }
      if (msg.type === 'preview_capture_result') {
        // A screenshot is an ephemeral sensitive image. Forward only to this
        // session's mobile clients, do not insert into message_history/SQLite.
        const image = typeof msg.image === 'string' ? msg.image : ''
        const success = msg.success === true && image.length > 0 && image.length <= 700000
          && /^[A-Za-z0-9+/=]+$/.test(image)
        sendWorkspaceEvent(sessionId, {
          type: 'preview_capture_result',
          workspaceId: ws.workspaceId,
          windowId: typeof msg.windowId === 'string' ? msg.windowId : '',
          request_id: String(msg.request_id ?? ''),
          success,
          image: success ? image : undefined,
          mime: 'image/png',
          error: success ? undefined : String(msg.error ?? 'preview_failed').slice(0, 120),
        })
        return
      }
      if (msg.type === 'projects_update') {
        const projects = Array.isArray(msg.projects) ? msg.projects : []
        const parentDir = typeof msg.parentDir === 'string' ? msg.parentDir : ''
        sendWorkspaceEvent(sessionId, { type: 'projects_update', workspaceId: ws.workspaceId,
          projects, parentDir, payload: { projects, parentDir } })
        return
      }

      const envelope = store.append(sessionId, 'agent', {
        type: String(msg.type),
        workspaceId: ws.workspaceId,
        workspaceName: ws.workspaceName,
        workspacePath: ws.workspacePath,
        target: typeof msg.target === 'string' ? msg.target : undefined,
        tool: typeof msg.tool === 'string' ? msg.tool : undefined,
        text: typeof msg.text === 'string' ? msg.text : undefined,
        payload,
      })
      if (envelope) sendWorkspaceEvent(sessionId, { ...envelope })
    })

    ws.on('close', () => {
      clearTimeout(authenticationDeadline)
      for (const [id, pending] of pendingAgentRequests) {
        if (pending.socket !== ws) continue
        clearTimeout(pending.timer)
        pendingAgentRequests.delete(id)
        pending.reject(new Error('agent disconnected'))
      }
      if (ws.expiryTimer) clearTimeout(ws.expiryTimer)
      if (!ws.claims) return
      const sessionPeers = peers.get(ws.claims.sessionId)
      if (!sessionPeers) return
      if (ws.claims.role === 'mobile') {
        sessionPeers.mobiles.delete(ws)
      } else if (ws.workspaceId && sessionPeers.agents.get(ws.workspaceId) === ws) {
        sessionPeers.agents.delete(ws.workspaceId)
        sendWorkspaceEvent(ws.claims.sessionId, {
          type: 'workspace_disconnected',
          workspace_id: ws.workspaceId,
        })
        if (sessionPeers.activeWorkspaceId === ws.workspaceId) {
          sessionPeers.activeWorkspaceId = Array.from(sessionPeers.agents.keys()).at(-1) ?? null
        }
      }
      if (!sessionPeers.mobiles.size && !sessionPeers.agents.size) {
        peers.delete(ws.claims.sessionId)
      } else {
        broadcastPeerStatus(ws.claims.sessionId)
      }
    })
  })

  return { app, httpServer, wss }
}
