/** Project identity comes from the running VS Code window, not the agent ID. */
export function normalizedProjectPath(value: string): string {
  const cleaned = value.trim().replace(/\\/g, '/').replace(/\/+$/, '')
  return cleaned || (value.trim().startsWith('/') ? '/' : '')
}

export function activeProjectPath(ideState: { workspaceFolders?: string[] } | null | undefined): string {
  const folders = ideState?.workspaceFolders
  return Array.isArray(folders) && typeof folders[0] === 'string'
    ? normalizedProjectPath(folders[0])
    : ''
}

export function projectName(projectPath: string): string {
  return normalizedProjectPath(projectPath).split('/').filter(Boolean).pop() ?? ''
}

export function projectIsActive(projectPath: string, currentPath: string): boolean {
  return Boolean(normalizedProjectPath(projectPath) && normalizedProjectPath(projectPath) === normalizedProjectPath(currentPath))
}

export function scopedProjectKey(workspaceKey: string, projectPath: string): string {
  return workspaceKey ? JSON.stringify([workspaceKey, normalizedProjectPath(projectPath)]) : ''
}
