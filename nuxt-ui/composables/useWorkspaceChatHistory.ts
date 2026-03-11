export interface WorkspaceChatMessage {
  id: string
  text: string
  direction: 'user' | 'ai'
  tool?: string
  ts: number
}

const STORAGE_PREFIX = 'vb:chatHistory:'

function normalizeWorkspaceKey(workspaceId: string): string {
  const trimmed = workspaceId.trim()
  return trimmed || 'default'
}

function storageKey(workspaceId: string): string {
  return `${STORAGE_PREFIX}${normalizeWorkspaceKey(workspaceId)}`
}

export function loadWorkspaceChatHistory(workspaceId: string): WorkspaceChatMessage[] {
  if (import.meta.server) return []
  try {
    const raw = localStorage.getItem(storageKey(workspaceId))
    if (!raw) return []
    const parsed = JSON.parse(raw) as WorkspaceChatMessage[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveWorkspaceChatHistory(workspaceId: string, messages: WorkspaceChatMessage[]): void {
  if (import.meta.server) return
  try {
    localStorage.setItem(storageKey(workspaceId), JSON.stringify(messages.slice(-150)))
  } catch {
    // ignore storage quota errors
  }
}
