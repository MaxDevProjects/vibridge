/**
 * Display a compact resume only after a real absence, never as a persistent
 * dashboard. Everything comes from already observed events.
 */
export interface ReentryEntry {
  ts: number
  kind: 'user' | 'output' | 'status'
}
export interface ReentryActivity {
  updatedAt: number
  items: Array<{ status: string; kind: string; updatedAt?: number }>
}
export interface ReentrySummary {
  outputCount: number
  attentionCount: number
  verifiedCount: number
  latestAt: number
}
export function computeReentrySummary(
  lastViewedAt: number,
  entries: ReentryEntry[],
  activity?: ReentryActivity | null,
): ReentrySummary | null {
  if (!Number.isFinite(lastViewedAt) || lastViewedAt <= 0) return null
  const updates = entries.filter(e => e.kind === 'output' && Number.isFinite(e.ts) && e.ts > lastViewedAt)
  const activityChanged = Boolean(activity && activity.updatedAt > lastViewedAt)
  if (!updates.length && !activityChanged) return null
  const changedItems = activityChanged
    ? (activity?.items ?? []).filter(item => item.kind !== 'output' && typeof item.updatedAt === 'number' && item.updatedAt > lastViewedAt)
    : []
  const attentionCount = changedItems.filter(item => item.status === 'attention' || item.status === 'failed').length
  const verifiedCount = changedItems.filter(item => item.status === 'confirmed').length
  const latestAt = Math.max(
    ...updates.map(item => item.ts),
    activityChanged ? activity!.updatedAt : 0,
  )
  return { outputCount: updates.length, attentionCount, verifiedCount, latestAt }
}
