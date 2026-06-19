import type { FileWithTags } from '@shared/types'

export interface RankContext {
  keyword: string
  /** 用于把 file.tagIds 翻译成名字做匹配 */
  tagNamesById: ReadonlyMap<string, string>
}

/**
 * 搜索排序优先级（设计文档第 7 节）：
 *   1. 文件名精确匹配
 *   2. 文件名包含关键词
 *   3. 标签名匹配（任一关联标签名包含关键词）
 *   4. 备注包含关键词
 * 不命中任何条件的行被剔除。空关键词时返回原顺序、不剔除。
 */
export function rankFiles(
  files: readonly FileWithTags[],
  ctx: RankContext
): FileWithTags[] {
  const kw = ctx.keyword.trim().toLowerCase()
  if (!kw) return [...files]

  const scored: Array<{ file: FileWithTags; score: number }> = []
  for (const f of files) {
    const name = f.name.toLowerCase()
    let score = 0
    if (name === kw) score = 4
    else if (name.includes(kw)) score = 3
    else {
      const tagHit = f.tagIds.some((tid) => {
        const n = ctx.tagNamesById.get(tid)
        return n ? n.toLowerCase().includes(kw) : false
      })
      if (tagHit) score = 2
      else if (f.note.toLowerCase().includes(kw)) score = 1
    }
    if (score > 0) scored.push({ file: f, score })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.map((s) => s.file)
}
