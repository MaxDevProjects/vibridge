import fs from 'fs'
import path from 'path'
import { randomInt, randomUUID } from 'crypto'
import Database from 'better-sqlite3'
import type { RelayEnvelope, RelayRole, RelaySession, StoredWorkspace, WorkspaceSnapshot } from './types'

const HISTORY_LIMIT = 100
const HISTORY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export class RelayStore {
  private db: InstanceType<typeof Database>

  constructor(private dbPath = process.env.RELAY_DB_PATH ?? '/data/relay.db') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')
    this.db.pragma('foreign_keys = ON')
    this.migrate()
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        workspace_id TEXT,
        pairing_code TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        label TEXT,
        workspace_folders_json TEXT NOT NULL,
        agent_token TEXT NOT NULL,
        mobile_token TEXT
      );

      CREATE TABLE IF NOT EXISTS session_workspaces (
        session_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        name TEXT NOT NULL,
        path TEXT,
        last_seen_at INTEGER NOT NULL,
        PRIMARY KEY (session_id, workspace_id),
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS workspace_snapshots (
        session_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        ide_state_json TEXT,
        preview_url TEXT,
        file_tree_json TEXT,
        adapters_json TEXT,
        active_adapter TEXT,
        timestamp INTEGER NOT NULL,
        PRIMARY KEY (session_id, workspace_id),
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS message_history (
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
        payload_json TEXT,
        ts INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_expires_at
      ON sessions(expires_at);

      CREATE INDEX IF NOT EXISTS idx_session_workspaces_session_id
      ON session_workspaces(session_id);

      CREATE INDEX IF NOT EXISTS idx_workspace_snapshots_session_id
      ON workspace_snapshots(session_id);

      CREATE INDEX IF NOT EXISTS idx_message_history_session_ts
      ON message_history(session_id, ts DESC);
    `)
  }

  private makePairingCode(): string {
    return String(randomInt(0, 1_000_000)).padStart(6, '0')
  }

  private mapSession(row: Record<string, unknown> | undefined, includeHistory = true): RelaySession | null {
    if (!row) return null
    const sessionId = String(row.id)
    return {
      id: sessionId,
      workspaceId: typeof row.workspace_id === 'string' ? row.workspace_id : undefined,
      pairingCode: String(row.pairing_code),
      status: String(row.status) as RelaySession['status'],
      createdAt: Number(row.created_at),
      expiresAt: Number(row.expires_at),
      label: typeof row.label === 'string' ? row.label : undefined,
      workspaceFolders: parseJson<string[]>(typeof row.workspace_folders_json === 'string' ? row.workspace_folders_json : null, []),
      agentToken: String(row.agent_token),
      mobileToken: typeof row.mobile_token === 'string' ? row.mobile_token : null,
      history: includeHistory ? this.listHistory(sessionId) : [],
    }
  }

  createSession(input: { label?: string; workspaceId?: string; workspaceFolders?: string[]; agentToken: string; expiresAt: number }) {
    const session: RelaySession = {
      id: `sess_${randomUUID()}`,
      workspaceId: input.workspaceId,
      pairingCode: this.makePairingCode(),
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
      INSERT INTO sessions (
        id, workspace_id, pairing_code, status, created_at, expires_at, label, workspace_folders_json, agent_token, mobile_token
      ) VALUES (
        @id, @workspaceId, @pairingCode, @status, @createdAt, @expiresAt, @label, @workspaceFoldersJson, @agentToken, @mobileToken
      )
    `).run({
      id: session.id,
      workspaceId: session.workspaceId ?? null,
      pairingCode: session.pairingCode,
      status: session.status,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      label: session.label ?? null,
      workspaceFoldersJson: JSON.stringify(session.workspaceFolders),
      agentToken: session.agentToken,
      mobileToken: session.mobileToken,
    })
    return session
  }

  updateSessionTokens(sessionId: string, updates: { agentToken?: string; mobileToken?: string | null }) {
    const existing = this.getSession(sessionId)
    if (!existing) return null
    this.db.prepare(`
      UPDATE sessions
      SET agent_token = @agentToken,
          mobile_token = @mobileToken
      WHERE id = @sessionId
    `).run({
      sessionId,
      agentToken: updates.agentToken ?? existing.agentToken,
      mobileToken: updates.mobileToken === undefined ? existing.mobileToken : updates.mobileToken,
    })
    return this.getSession(sessionId)
  }

  getSession(sessionId: string) {
    const row = this.db.prepare(`
      SELECT id, workspace_id, pairing_code, status, created_at, expires_at, label, workspace_folders_json, agent_token, mobile_token
      FROM sessions
      WHERE id = ?
    `).get(sessionId) as Record<string, unknown> | undefined
    return this.mapSession(row)
  }

  listSessions() {
    const rows = this.db.prepare(`
      SELECT id, workspace_id, pairing_code, status, created_at, expires_at, label, workspace_folders_json, agent_token, mobile_token
      FROM sessions
      ORDER BY created_at DESC
    `).all() as Array<Record<string, unknown>>
    return rows.map(row => this.mapSession(row, false)).filter((session): session is RelaySession => Boolean(session))
  }

  findByToken(token: string, role: RelayRole): RelaySession | null {
    const column = role === 'agent' ? 'agent_token' : 'mobile_token'
    const row = this.db.prepare(`
      SELECT id, workspace_id, pairing_code, status, created_at, expires_at, label, workspace_folders_json, agent_token, mobile_token
      FROM sessions
      WHERE ${column} = ?
      LIMIT 1
    `).get(token) as Record<string, unknown> | undefined
    return this.mapSession(row)
  }

  setPairingCode(sessionId: string, pairingCode: string) {
    this.db.prepare(`
      UPDATE sessions
      SET pairing_code = ?
      WHERE id = ?
    `).run(pairingCode, sessionId)
  }

  pair(sessionId: string, code: string, mobileToken: string): RelaySession | null {
    const updated = this.db.prepare(`
      UPDATE sessions
      SET mobile_token = @mobileToken,
          status = 'paired'
      WHERE id = @sessionId
        AND expires_at > @now
        AND pairing_code = @code
    `).run({
      sessionId,
      mobileToken,
      now: Date.now(),
      code,
    })
    if (updated.changes === 0) return null
    return this.getSession(sessionId)
  }

  append(sessionId: string, source: RelayEnvelope['source'], data: Omit<RelayEnvelope, 'id' | 'sessionId' | 'source' | 'ts'>) {
    const exists = this.db.prepare(`
      SELECT 1
      FROM sessions
      WHERE id = ?
      LIMIT 1
    `).get(sessionId) as Record<string, unknown> | undefined
    if (!exists) return null
    const envelope: RelayEnvelope = {
      id: randomUUID(),
      sessionId,
      source,
      ts: Date.now(),
      ...data,
    }
    const tx = this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO message_history (
          id, session_id, source, type, workspace_id, workspace_name, workspace_path, target, tool, text, payload_json, ts
        ) VALUES (
          @id, @sessionId, @source, @type, @workspaceId, @workspaceName, @workspacePath, @target, @tool, @text, @payloadJson, @ts
        )
      `).run({
        id: envelope.id,
        sessionId: envelope.sessionId,
        source: envelope.source,
        type: envelope.type,
        workspaceId: envelope.workspaceId ?? null,
        workspaceName: envelope.workspaceName ?? null,
        workspacePath: envelope.workspacePath ?? null,
        target: envelope.target ?? null,
        tool: envelope.tool ?? null,
        text: envelope.text ?? null,
        payloadJson: envelope.payload === undefined ? null : JSON.stringify(envelope.payload),
        ts: envelope.ts,
      })
      this.db.prepare(`
        DELETE FROM message_history
        WHERE session_id = @sessionId
          AND id IN (
            SELECT id
            FROM message_history
            WHERE session_id = @sessionId
            ORDER BY ts DESC, rowid DESC
            LIMIT -1 OFFSET @limit
          )
      `).run({ sessionId, limit: HISTORY_LIMIT })
    })
    tx()
    return envelope
  }

  pruneHistory(now = Date.now(), sessionId?: string) {
    const cutoff = now - HISTORY_RETENTION_MS
    if (sessionId) {
      this.db.prepare(`
        DELETE FROM message_history
        WHERE session_id = ?
          AND (
            ts < ?
            OR id IN (
              SELECT id
              FROM message_history
              WHERE session_id = ?
              ORDER BY ts DESC, rowid DESC
              LIMIT -1 OFFSET ?
            )
          )
      `).run(sessionId, cutoff, sessionId, HISTORY_LIMIT)
      return
    }

    this.db.prepare(`
      DELETE FROM message_history
      WHERE ts < ?
    `).run(cutoff)

    const sessions = this.db.prepare(`
      SELECT id
      FROM sessions
    `).all() as Array<{ id: string }>
    const trimStatement = this.db.prepare(`
      DELETE FROM message_history
      WHERE session_id = ?
        AND id IN (
          SELECT id
          FROM message_history
          WHERE session_id = ?
          ORDER BY ts DESC, rowid DESC
          LIMIT -1 OFFSET ?
        )
    `)
    for (const session of sessions) {
      trimStatement.run(session.id, session.id, HISTORY_LIMIT)
    }
  }

  listHistory(sessionId: string): RelayEnvelope[] {
    const rows = this.db.prepare(`
      SELECT id, session_id, source, type, workspace_id, workspace_name, workspace_path, target, tool, text, payload_json, ts
      FROM message_history
      WHERE session_id = ?
      ORDER BY ts ASC
    `).all(sessionId) as Array<Record<string, unknown>>
    return rows.map(row => ({
      id: String(row.id),
      sessionId: String(row.session_id),
      source: String(row.source) as RelayEnvelope['source'],
      type: String(row.type),
      workspaceId: typeof row.workspace_id === 'string' ? row.workspace_id : undefined,
      workspaceName: typeof row.workspace_name === 'string' ? row.workspace_name : undefined,
      workspacePath: typeof row.workspace_path === 'string' ? row.workspace_path : undefined,
      target: typeof row.target === 'string' ? row.target : undefined,
      tool: typeof row.tool === 'string' ? row.tool : undefined,
      text: typeof row.text === 'string' ? row.text : undefined,
      payload: parseJson(row.payload_json as string | null, undefined),
      ts: Number(row.ts),
    }))
  }

  upsertWorkspace(sessionId: string, workspace: { id: string; name: string; path?: string }) {
    this.db.prepare(`
      INSERT INTO session_workspaces (session_id, workspace_id, name, path, last_seen_at)
      VALUES (@sessionId, @workspaceId, @name, @path, @lastSeenAt)
      ON CONFLICT(session_id, workspace_id) DO UPDATE SET
        name = excluded.name,
        path = excluded.path,
        last_seen_at = excluded.last_seen_at
    `).run({
      sessionId,
      workspaceId: workspace.id,
      name: workspace.name,
      path: workspace.path ?? null,
      lastSeenAt: Date.now(),
    })
  }

  listWorkspaces(sessionId: string): StoredWorkspace[] {
    const rows = this.db.prepare(`
      SELECT workspace_id, name, path, last_seen_at
      FROM session_workspaces
      WHERE session_id = ?
      ORDER BY last_seen_at ASC, workspace_id ASC
    `).all(sessionId) as Array<Record<string, unknown>>
    return rows.map(row => ({
      id: String(row.workspace_id),
      name: String(row.name),
      path: typeof row.path === 'string' ? row.path : undefined,
      lastSeenAt: Number(row.last_seen_at),
    }))
  }

  upsertWorkspaceSnapshot(
    sessionId: string,
    workspaceId: string,
    payload: Record<string, unknown>,
  ) {
    const previous = this.getWorkspaceSnapshot(sessionId, workspaceId)
    const next: WorkspaceSnapshot = {
      workspaceId,
      ideState: payload.ideState ?? previous?.ideState,
      previewUrl: typeof payload.previewUrl === 'string' || payload.previewUrl === null
        ? payload.previewUrl as string | null
        : previous?.previewUrl ?? null,
      fileTree: payload.fileTree ?? previous?.fileTree,
      adapters: payload.adapters ?? previous?.adapters,
      activeAdapter: typeof payload.activeAdapter === 'string' || payload.activeAdapter === null
        ? payload.activeAdapter as string | null
        : previous?.activeAdapter ?? null,
      timestamp: typeof payload.timestamp === 'number' ? payload.timestamp : Date.now(),
    }
    this.db.prepare(`
      INSERT INTO workspace_snapshots (
        session_id, workspace_id, ide_state_json, preview_url, file_tree_json, adapters_json, active_adapter, timestamp
      ) VALUES (
        @sessionId, @workspaceId, @ideStateJson, @previewUrl, @fileTreeJson, @adaptersJson, @activeAdapter, @timestamp
      )
      ON CONFLICT(session_id, workspace_id) DO UPDATE SET
        ide_state_json = excluded.ide_state_json,
        preview_url = excluded.preview_url,
        file_tree_json = excluded.file_tree_json,
        adapters_json = excluded.adapters_json,
        active_adapter = excluded.active_adapter,
        timestamp = excluded.timestamp
    `).run({
      sessionId,
      workspaceId,
      ideStateJson: next.ideState === undefined ? null : JSON.stringify(next.ideState),
      previewUrl: next.previewUrl ?? null,
      fileTreeJson: next.fileTree === undefined ? null : JSON.stringify(next.fileTree),
      adaptersJson: next.adapters === undefined ? null : JSON.stringify(next.adapters),
      activeAdapter: next.activeAdapter ?? null,
      timestamp: next.timestamp,
    })
  }

  getWorkspaceSnapshot(sessionId: string, workspaceId: string): WorkspaceSnapshot | null {
    const row = this.db.prepare(`
      SELECT workspace_id, ide_state_json, preview_url, file_tree_json, adapters_json, active_adapter, timestamp
      FROM workspace_snapshots
      WHERE session_id = ? AND workspace_id = ?
    `).get(sessionId, workspaceId) as Record<string, unknown> | undefined
    if (!row) return null
    return {
      workspaceId: String(row.workspace_id),
      ideState: parseJson(row.ide_state_json as string | null, undefined),
      previewUrl: typeof row.preview_url === 'string' || row.preview_url === null ? row.preview_url as string | null : null,
      fileTree: parseJson(row.file_tree_json as string | null, undefined),
      adapters: parseJson(row.adapters_json as string | null, undefined),
      activeAdapter: typeof row.active_adapter === 'string' || row.active_adapter === null ? row.active_adapter as string | null : null,
      timestamp: Number(row.timestamp),
    }
  }

  listWorkspaceSnapshots(sessionId: string): WorkspaceSnapshot[] {
    const rows = this.db.prepare(`
      SELECT workspace_id, ide_state_json, preview_url, file_tree_json, adapters_json, active_adapter, timestamp
      FROM workspace_snapshots
      WHERE session_id = ?
      ORDER BY timestamp ASC, workspace_id ASC
    `).all(sessionId) as Array<Record<string, unknown>>
    return rows.map(row => ({
      workspaceId: String(row.workspace_id),
      ideState: parseJson(row.ide_state_json as string | null, undefined),
      previewUrl: typeof row.preview_url === 'string' || row.preview_url === null ? row.preview_url as string | null : null,
      fileTree: parseJson(row.file_tree_json as string | null, undefined),
      adapters: parseJson(row.adapters_json as string | null, undefined),
      activeAdapter: typeof row.active_adapter === 'string' || row.active_adapter === null ? row.active_adapter as string | null : null,
      timestamp: Number(row.timestamp),
    }))
  }

  deleteWorkspaceSnapshot(sessionId: string, workspaceId: string) {
    this.db.prepare(`
      DELETE FROM workspace_snapshots
      WHERE session_id = ? AND workspace_id = ?
    `).run(sessionId, workspaceId)
  }

  pruneExpired(now = Date.now()) {
    this.db.prepare(`
      DELETE FROM sessions
      WHERE expires_at <= ?
    `).run(now)
    this.pruneHistory(now)
  }
}
