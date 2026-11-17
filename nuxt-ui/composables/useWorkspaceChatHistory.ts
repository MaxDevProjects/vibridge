export interface WorkspaceChatMessage {
  id: string
  text: string
  direction: 'user' | 'ai'
  tool?: string
  target?: string
  ts: number
}

const STORAGE_PREFIX = 'vb:chatHistory:'

export function resolveChatHistoryKey(mode: 'relay' | 'local', base: string, sessionId: string, workspaceId: string): string {
  if (mode === 'relay') return sessionId && workspaceId ? JSON.stringify(['relay', base, sessionId, workspaceId]) : ''
  return base ? JSON.stringify(['local', base]) : ''
}

export function loadWorkspaceChatHistory(workspaceId: string): WorkspaceChatMessage[] {
  if (import.meta.server || !workspaceId) return []
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + workspaceId)
    if (!raw) return []
    const parsed = JSON.parse(raw) as WorkspaceChatMessage[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveWorkspaceChatHistory(workspaceId: string, messages: WorkspaceChatMessage[]): void {
  if (import.meta.server || !workspaceId) return
  try {
    localStorage.setItem(STORAGE_PREFIX + workspaceId, JSON.stringify(messages.slice(-150)))
  } catch {
    // ignore storage quota errors
  }
}
