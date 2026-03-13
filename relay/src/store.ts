import fs from 'fs'
import path from 'path'
import { randomInt } from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import Database from 'better-sqlite3'
import type { RelayEnvelope, RelayRole, RelaySession } from './types'

const HISTORY_LIMIT = 100
const HISTORY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

function makePairingCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

interface SessionRow {
  id: string
  workspace_id: string | null
  pairing_code: string
  status: 'waiting' | 'paired' | 'closed'
  created_at: number
  expires_at: number
  label: string | null
  workspace_folders: string
  agent_token: string
  mobile_token: string | null
}

interface HistoryRow {
  id: string
  session_id: string
  source: RelayRole | 'relay'
  type: string
  workspace_id: string | null
  workspace_name: string | null
  workspace_path: string | null
  target: string | null
  tool: string | null
  text: string | null
  payload: string | null
  ts: number
}

export class RelayStore {
  private db: any

  constructor(dbPath = process.env.RELAY_DB_PATH ?? '/tmp/devbridge-relay.db') {
    const resolvedPath = path.resolve(dbPath)
    const dir = path.dirname(resolvedPath)
    fs.mkdirSync(dir, { recursive: true })

    this.db = new Database(resolvedPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')
    this.db.pragma('foreign_keys = ON')
    this.bootstrap()
  }

  private bootstrap(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS relay_sessions (
        id TEXT PRIMARY KEY,
        workspace_id TEXT,
        pairing_code TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        label TEXT,
        workspace_folders TEXT NOT NULL,
        agent_token TEXT NOT NULL,
        mobile_token TEXT
      );

      CREATE TABLE IF NOT EXISTS relay_history (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        source TEXT NOT NULL,
        type TEXT NOT NULL,
        workspace_id TEXT,
        workspace_name TEXT,
        workspace_path TEXT,
        target TEXT,
        tool TEXT,
        text TEXT,
        payload TEXT,
        ts INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES relay_sessions(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_relay_sessions_expires_at ON relay_sessions(expires_at);
      CREATE INDEX IF NOT EXISTS idx_relay_sessions_agent_token ON relay_sessions(agent_token);
      CREATE INDEX IF NOT EXISTS idx_relay_sessions_mobile_token ON relay_sessions(mobile_token);
      CREATE INDEX IF NOT EXISTS idx_relay_history_session_ts ON relay_history(session_id, ts DESC);
    `)
  }

  createSession(input: { label?: string; workspaceId?: string; workspaceFolders?: string[]; agentToken: string; expiresAt: number }): RelaySession {
    const session: RelaySession = {
      id: `sess_${uuidv4()}`,
      workspaceId: input.workspaceId,
      pairingCode: makePairingCode(),
      status: 'waiting',
      createdAt: Date.now(),
      expiresAt: input.expiresAt,
      label: input.label,
      workspaceFolders: input.workspaceFolders ?? [],
      agentToken: input.agentToken,
      mobileToken: null,
      history: [],
    }

    this.db.prepare(`
      INSERT INTO relay_sessions (
        id, workspace_id, pairing_code, status, created_at, expires_at, label, workspace_folders, agent_token, mobile_token
      ) VALUES (
        @id, @workspace_id, @pairing_code, @status, @created_at, @expires_at, @label, @workspace_folders, @agent_token, @mobile_token
      )
    `).run({
      id: session.id,
      workspace_id: session.workspaceId ?? null,
      pairing_code: session.pairingCode,
      status: session.status,
      created_at: session.createdAt,
      expires_at: session.expiresAt,
      label: session.label ?? null,
      workspace_folders: JSON.stringify(session.workspaceFolders),
      agent_token: session.agentToken,
      mobile_token: session.mobileToken,
    })

    return session
  }

  getSession(sessionId: string): RelaySession | null {
    const row = this.db.prepare('SELECT * FROM relay_sessions WHERE id = ?').get(sessionId) as SessionRow | undefined
    if (!row) return null
    return this.mapSessionRow(row)
  }

  listSessions(): RelaySession[] {
    const rows = this.db.prepare('SELECT * FROM relay_sessions ORDER BY created_at DESC').all() as SessionRow[]
    return rows.map((row) => this.mapSessionRow(row, false))
  }

  findByToken(token: string, role: RelayRole): RelaySession | null {
    const column = role === 'agent' ? 'agent_token' : 'mobile_token'
    const row = this.db.prepare(`SELECT * FROM relay_sessions WHERE ${column} = ? LIMIT 1`).get(token) as SessionRow | undefined
    if (!row) return null
    return this.mapSessionRow(row)
  }

  pair(sessionId: string, code: string, mobileToken: string): RelaySession | null {
    const row = this.db.prepare('SELECT * FROM relay_sessions WHERE id = ?').get(sessionId) as SessionRow | undefined
    if (!row) return null
    if (row.expires_at < Date.now()) return null
    if (row.pairing_code !== code) return null

    this.db.prepare('UPDATE relay_sessions SET mobile_token = ?, status = ? WHERE id = ?').run(mobileToken, 'paired', sessionId)
    return this.getSession(sessionId)
  }

  append(sessionId: string, source: RelayEnvelope['source'], data: Omit<RelayEnvelope, 'id' | 'sessionId' | 'source' | 'ts'>): RelayEnvelope | null {
    const exists = this.db.prepare('SELECT 1 FROM relay_sessions WHERE id = ? LIMIT 1').get(sessionId) as { 1: number } | undefined
    if (!exists) return null

    const envelope: RelayEnvelope = {
      id: uuidv4(),
      sessionId,
      source,
      ts: Date.now(),
      ...data,
    }

    this.db.prepare(`
      INSERT INTO relay_history (
        id, session_id, source, type, workspace_id, workspace_name, workspace_path, target, tool, text, payload, ts
      ) VALUES (
        @id, @session_id, @source, @type, @workspace_id, @workspace_name, @workspace_path, @target, @tool, @text, @payload, @ts
      )
    `).run({
      id: envelope.id,
      session_id: envelope.sessionId,
      source: envelope.source,
      type: envelope.type,
      workspace_id: envelope.workspaceId ?? null,
      workspace_name: envelope.workspaceName ?? null,
      workspace_path: envelope.workspacePath ?? null,
      target: envelope.target ?? null,
      tool: envelope.tool ?? null,
      text: envelope.text ?? null,
      payload: envelope.payload === undefined ? null : JSON.stringify(envelope.payload),
      ts: envelope.ts,
    })

    this.pruneHistory(Date.now(), sessionId)
    return envelope
  }

  pruneHistory(now = Date.now(), sessionId?: string): void {
    const cutoff = now - HISTORY_RETENTION_MS
    if (sessionId) {
      this.db.prepare(`
        DELETE FROM relay_history
        WHERE session_id = ?
          AND (
            ts < ?
            OR id IN (
              SELECT id FROM relay_history
              WHERE session_id = ?
              ORDER BY ts DESC, rowid DESC
              LIMIT -1 OFFSET ?
            )
          )
      `).run(sessionId, cutoff, sessionId, HISTORY_LIMIT)
      return
    }

    this.db.prepare('DELETE FROM relay_history WHERE ts < ?').run(cutoff)

    const sessions = this.db.prepare('SELECT id FROM relay_sessions').all() as Array<{ id: string }>
    const trimStmt = this.db.prepare(`
      DELETE FROM relay_history
      WHERE session_id = ?
        AND id IN (
          SELECT id FROM relay_history
          WHERE session_id = ?
          ORDER BY ts DESC, rowid DESC
          LIMIT -1 OFFSET ?
        )
    `)
    for (const session of sessions) {
      trimStmt.run(session.id, session.id, HISTORY_LIMIT)
    }
  }

  pruneExpired(now = Date.now()): void {
    this.db.prepare('DELETE FROM relay_sessions WHERE expires_at <= ?').run(now)
    this.pruneHistory(now)
  }

  private mapSessionRow(row: SessionRow, includeHistory = true): RelaySession {
    return {
      id: row.id,
      workspaceId: row.workspace_id ?? undefined,
      pairingCode: row.pairing_code,
      status: row.status,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      label: row.label ?? undefined,
      workspaceFolders: this.parseWorkspaceFolders(row.workspace_folders),
      agentToken: row.agent_token,
      mobileToken: row.mobile_token,
      history: includeHistory ? this.getSessionHistory(row.id) : [],
    }
  }

  private getSessionHistory(sessionId: string): RelayEnvelope[] {
    const rows = this.db.prepare(`
      SELECT * FROM relay_history
      WHERE session_id = ?
      ORDER BY ts ASC, rowid ASC
    `).all(sessionId) as HistoryRow[]

    return rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      source: row.source,
      type: row.type,
      workspaceId: row.workspace_id ?? undefined,
      workspaceName: row.workspace_name ?? undefined,
      workspacePath: row.workspace_path ?? undefined,
      target: row.target ?? undefined,
      tool: row.tool ?? undefined,
      text: row.text ?? undefined,
      payload: this.parsePayload(row.payload),
      ts: row.ts,
    }))
  }

  private parseWorkspaceFolders(raw: string): string[] {
    try {
      const parsed = JSON.parse(raw) as unknown
      return Array.isArray(parsed) ? parsed.map(String) : []
    } catch {
      return []
    }
  }

  private parsePayload(raw: string | null): unknown {
    if (raw === null) return undefined
    try {
      return JSON.parse(raw)
    } catch {
      return raw
    }
  }
}
