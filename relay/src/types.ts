export type RelayRole = 'agent' | 'mobile'

export interface RelayEnvelope {
  id: string
  sessionId: string
  source: RelayRole | 'relay'
  type: string
  workspaceId?: string
  workspaceName?: string
  workspacePath?: string
  target?: string
  tool?: string
  text?: string
  payload?: unknown
  ts: number
}

export interface RelaySession {
  id: string
  pairingCode: string
  status: 'waiting' | 'paired' | 'closed'
  createdAt: number
  expiresAt: number
  label?: string
  workspaceFolders: string[]
  agentToken: string
  mobileToken: string | null
  history: RelayEnvelope[]
}

export interface SessionClaims {
  sessionId: string
  role: RelayRole
}

export interface ConnectedWorkspace {
  id: string
  name: string
  path?: string
  active: boolean
}
