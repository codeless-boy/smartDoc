import type { FileFilter, FileWithTags } from '@shared/types'

export type EmptyStateKind =
  | { kind: 'loading' }
  | { kind: 'onboarding' }
  | { kind: 'no-match'; activeFilters: string[] }

/**
 * 根据当前 files / loading / filter 决定该渲染什么空状态；
 * 返回 null 表示不该渲染空状态（有数据）。
 *
 * 优先级：loading > files 非空 > 有活跃 filter → no-match > onboarding。
 */
export function deriveEmptyState(
  files: readonly FileWithTags[],
  loading: boolean,
  filter: FileFilter
): EmptyStateKind | null {
  if (loading) return { kind: 'loading' }
  if (files.length > 0) return null

  const activeFilters = summarizeFilter(filter)
  if (activeFilters.length === 0) return { kind: 'onboarding' }
  return { kind: 'no-match', activeFilters }
}

function summarizeFilter(f: FileFilter): string[] {
  const out: string[] = []
  if (f.keyword) out.push(`关键词: "${f.keyword}"`)
  if (f.exts && f.exts.length > 0) out.push(`类型: ${f.exts.join(', ')}`)
  if (f.tagIds && f.tagIds.length > 0) out.push(`标签: ${f.tagIds.length} 个`)
  if (f.untagged) out.push('未打标签')
  if (f.topOpenedLimit) out.push(`常用文档（前 ${f.topOpenedLimit}）`)
  return out
}
