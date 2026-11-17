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
  workspaceId?: string
  workspaceName?: string
  workspacePath?: string
}

interface SessionPeers {
  mobile: AuthenticatedSocket | null
  agents: Map<string, AuthenticatedSocket>
  activeWorkspaceId: string | null
}

interface PendingAgentRequest {
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
      mobileConnected: Boolean(sessionPeers?.mobile),
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
      mobileConnected: Boolean(sessionPeers?.mobile),
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
    peers.get(sessionId)?.mobile?.close(4401, 'mobile credential replaced')
    res.json({
      sessionId: session.id,
      mobileToken,
      expiresAt: session.expiresAt,
      relayUrl: publicBaseUrl,
    })
  })

  app.post('/api/relay/pairing-code', requireSessionAuth(['agent']), (req, res) => {
    const { sessionId } = (req as Request & { claims: SessionClaims }).claims
    const pairingCode = store.renewPairingCode(sessionId)
    if (!pairingCode) {
      res.status(404).json({ error: 'not found' })
      return
    }
    pairingAttempts.delete(sessionId)
    res.json({ pairingCode, qrUrl: buildQrUrl(sessionId, pairingCode) })
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
      mobileConnected: Boolean(sessionPeers?.mobile),
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

    const workspaceId = String(req.query.workspaceId ?? '').trim() || undefined
    const filePath = String(req.query.path ?? '').trim()

    if (!filePath) {
      const snapshot = workspaceId
        ? store.getWorkspaceSnapshot(sessionId, workspaceId)
        : listWorkspaceSnapshots(sessionId)[0]
      res.json({ tree: snapshot?.fileTree ?? [] })
      return
    }

    try {
      const response = await requestAgentPayload(sessionId, workspaceId, 'relay_file_request', {
        path: filePath,
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

  // ── CLI Registry proxy (forwarded to agent via WebSocket) ──────────
  app.get('/clis', requireSessionAuth(['mobile']), async (req, res) => {
    const claims = (req as Request & { claims?: SessionClaims }).claims!
    try {
      const response = await requestAgentPayload(claims.sessionId, undefined, 'relay_clis_request', { action: 'list' })
      res.json({ clis: response.clis ?? [] })
    } catch (error) {
      res.status(503).json({ error: error instanceof Error ? error.message : 'agent unavailable' })
    }
  })

  app.post('/clis/detect', requireSessionAuth(['mobile']), async (req, res) => {
    const claims = (req as Request & { claims?: SessionClaims }).claims!
    try {
      const response = await requestAgentPayload(claims.sessionId, undefined, 'relay_clis_request', { action: 'detect' })
      res.json({ clis: response.clis ?? [] })
    } catch (error) {
      res.status(503).json({ error: error instanceof Error ? error.message : 'agent unavailable' })
    }
  })

  app.post('/clis/default', requireSessionAuth(['mobile']), async (req, res) => {
    const claims = (req as Request & { claims?: SessionClaims }).claims!
    const { id } = req.body as { id: string }
    try {
      const response = await requestAgentPayload(claims.sessionId, undefined, 'relay_clis_request', { action: 'set_default', id })
      res.json({ ok: response.ok ?? false, clis: response.clis ?? [] })
    } catch (error) {
      res.status(503).json({ error: error instanceof Error ? error.message : 'agent unavailable' })
    }
  })

  app.post('/clis/custom', requireSessionAuth(['mobile']), async (req, res) => {
    const claims = (req as Request & { claims?: SessionClaims }).claims!
    const { name, command, args } = req.body as { name: string; command: string; args?: string[] }
    try {
      const response = await requestAgentPayload(claims.sessionId, undefined, 'relay_clis_request', { action: 'add_custom', name, command, args })
      res.json({ ok: response.ok ?? false, cli: response.cli, clis: response.clis ?? [] })
    } catch (error) {
      res.status(503).json({ error: error instanceof Error ? error.message : 'agent unavailable' })
    }
  })

  app.delete('/clis/:id', requireSessionAuth(['mobile']), async (req, res) => {
    const claims = (req as Request & { claims?: SessionClaims }).claims!
    const { id } = req.params
    try {
      const response = await requestAgentPayload(claims.sessionId, undefined, 'relay_clis_request', { action: 'remove_custom', id })
      res.json({ ok: response.ok ?? false })
    } catch (error) {
      res.status(503).json({ error: error instanceof Error ? error.message : 'agent unavailable' })
    }
  })

  const httpServer = http.createServer(app)
  const wss = new WebSocketServer({ server: httpServer, path: '/ws', maxPayload: 4 * 1024 * 1024 })
  wss.on('close', () => clearInterval(sweepAttempts))

  function getSessionPeers(sessionId: string): SessionPeers {
    const sessionPeers = peers.get(sessionId)
    if (sessionPeers) return sessionPeers
    const next: SessionPeers = {
      mobile: null,
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
    const targetAgent = resolveTargetAgent(sessionId, workspaceId)
    if (!targetAgent || targetAgent.readyState !== WebSocket.OPEN) {
      throw new Error('workspace unavailable')
    }

    const requestId = randomUUID()
    const response = new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingAgentRequests.delete(requestId)
        reject(new Error('agent request timeout'))
      }, 5_000)
      pendingAgentRequests.set(requestId, { resolve, reject, timer })
    })

    targetAgent.send(JSON.stringify({
      type,
      request_id: requestId,
      ...payload,
      ...(workspaceId ? { workspace_id: workspaceId } : {}),
    }))

    return response
  }

  function broadcastPeerStatus(sessionId: string) {
    const sessionPeers = peers.get(sessionId)
    if (!sessionPeers) return
    const payload = JSON.stringify({
      type: 'peer_status',
      agentConnected: sessionPeers.agents.size > 0,
      mobileConnected: Boolean(sessionPeers.mobile),
    })
    if (sessionPeers.mobile?.readyState === WebSocket.OPEN) {
      sessionPeers.mobile.send(payload)
    }
    for (const peer of sessionPeers.agents.values()) {
      if (peer.readyState === WebSocket.OPEN) peer.send(payload)
    }
  }

  function sendWorkspaceEvent(sessionId: string, payload: Record<string, unknown>) {
    const mobile = peers.get(sessionId)?.mobile
    if (mobile?.readyState === WebSocket.OPEN) {
      mobile.send(JSON.stringify(payload))
    }
  }

  function registerAgentWorkspace(ws: AuthenticatedSocket, workspaceId: string, workspaceName: string, workspacePath?: string) {
    if (!ws.claims) return
    const sessionPeers = getSessionPeers(ws.claims.sessionId)
    const normalizedWorkspaceId = workspaceId.trim()
    if (!normalizedWorkspaceId) return

    if (ws.workspaceId && ws.workspaceId !== normalizedWorkspaceId) {
      sessionPeers.agents.delete(ws.workspaceId)
    }

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
    const explicitWorkspaceId = requestedWorkspaceId?.trim()
    if (explicitWorkspaceId) {
      return sessionPeers.agents.get(explicitWorkspaceId) ?? null
    }
    if (sessionPeers.activeWorkspaceId) {
      return sessionPeers.agents.get(sessionPeers.activeWorkspaceId) ?? null
    }
    const lastAgent = Array.from(sessionPeers.agents.values()).at(-1)
    return lastAgent ?? null
  }

  wss.on('connection', (ws: AuthenticatedSocket) => {
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
          sessionPeers.mobile = ws
        }
        ws.send(JSON.stringify({
          type: 'auth_ok',
          role: claims.role,
          sessionId: claims.sessionId,
          workspaces: listConnectedWorkspaces(claims.sessionId),
          history: session.history,
        }))
        broadcastPeerStatus(claims.sessionId)
        return
      }

      if (!sessionCredential(ws.token!, ws.claims)) {
        ws.close(4401, 'session expired or revoked')
        return
      }
      const { sessionId, role } = ws.claims
      if (role === 'agent' && msg.type === 'agent_hello') {
        const workspaceId = typeof msg.workspace_id === 'string' ? msg.workspace_id : ''
        if (!workspaceId.trim()) return
        registerAgentWorkspace(
          ws,
          workspaceId,
          typeof msg.workspace_name === 'string' ? msg.workspace_name : workspaceId,
          typeof msg.workspace_path === 'string' ? msg.workspace_path : undefined,
        )
        return
      }

      if (role === 'agent' && typeof msg.request_id === 'string' && pendingAgentRequests.has(msg.request_id as string)) {
        const pending = pendingAgentRequests.get(msg.request_id as string)!
        clearTimeout(pending.timer)
        pendingAgentRequests.delete(msg.request_id as string)
        pending.resolve(msg)
        return
      }

      if (role === 'agent' && msg.type === 'status_snapshot') {
        const workspaceId = typeof msg.workspace_id === 'string'
          ? msg.workspace_id
          : ws.workspaceId
        const payload = typeof msg.payload === 'object' && msg.payload
          ? msg.payload as Record<string, unknown>
          : msg
        if (workspaceId) {
          updateWorkspaceSnapshot(sessionId, workspaceId, payload)
        }
      }

      const targetWorkspaceId = typeof msg.workspace_id === 'string'
        ? msg.workspace_id
        : role === 'agent'
          ? ws.workspaceId
          : undefined
      const envelope = store.append(sessionId, role, {
        type: String(msg.type ?? 'relay_message'),
        workspaceId: targetWorkspaceId,
        workspaceName: role === 'agent' ? ws.workspaceName : undefined,
        workspacePath: role === 'agent' ? ws.workspacePath : undefined,
        target: typeof msg.target === 'string' ? msg.target : undefined,
        tool: typeof msg.tool === 'string' ? msg.tool : undefined,
        text: typeof msg.text === 'string' ? msg.text : undefined,
        payload: msg.payload,
      })
      if (!envelope) {
        ws.close(4404, 'session not found')
        return
      }
      const sessionPeers = peers.get(sessionId)
      if (!sessionPeers) return
      if (role === 'agent') {
        if (sessionPeers.mobile?.readyState === WebSocket.OPEN) {
          sessionPeers.mobile.send(JSON.stringify(envelope))
        }
        return
      }
      const targetAgent = resolveTargetAgent(sessionId, targetWorkspaceId)
      if (targetAgent?.readyState === WebSocket.OPEN) {
        targetAgent.send(JSON.stringify(envelope))
      }
    })

    ws.on('close', () => {
      clearTimeout(authenticationDeadline)
      if (ws.expiryTimer) clearTimeout(ws.expiryTimer)
      if (!ws.claims) return
      const sessionPeers = peers.get(ws.claims.sessionId)
      if (!sessionPeers) return
      if (ws.claims.role === 'mobile') {
        if (sessionPeers.mobile === ws) sessionPeers.mobile = null
      } else if (ws.workspaceId) {
        sessionPeers.agents.delete(ws.workspaceId)
        sendWorkspaceEvent(ws.claims.sessionId, {
          type: 'workspace_disconnected',
          workspace_id: ws.workspaceId,
        })
        if (sessionPeers.activeWorkspaceId === ws.workspaceId) {
          sessionPeers.activeWorkspaceId = Array.from(sessionPeers.agents.keys()).at(-1) ?? null
        }
      }
      if (!sessionPeers.mobile && sessionPeers.agents.size === 0) {
        peers.delete(ws.claims.sessionId)
      } else {
        broadcastPeerStatus(ws.claims.sessionId)
      }
    })
  })

  return { app, httpServer, wss }
}
