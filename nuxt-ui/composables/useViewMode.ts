export type ViewMode = 'both' | 'pc' | 'mobile'

export function useViewMode() {
  return useState<ViewMode>('viewMode', () => 'both')
}
