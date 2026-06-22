export type EscAction = 'close-drawer' | 'clear-keyword' | 'reset-filter' | null

interface State {
  selectedId: string | null
  keyword: string
  hasFilter: boolean
}

/**
 * Esc 键三级回退：先关抽屉 → 再清搜索 → 再重置筛选。
 * 任何时刻只触发优先级最高的那一级。
 */
export function deriveEscAction(s: State): EscAction {
  if (s.selectedId) return 'close-drawer'
  if (s.keyword) return 'clear-keyword'
  if (s.hasFilter) return 'reset-filter'
  return null
}
