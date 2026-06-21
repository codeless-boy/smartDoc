import type { Database } from 'better-sqlite3'
import type { SearchSuggestion } from '@shared/types'

export class SearchService {
  constructor(private readonly db: Database) {}

  /**
   * 前缀联想：返回最多 8 条候选，混合文件名与标签名。
   * 大小写不敏感，按字母序。
   */
  suggest(prefix: string): SearchSuggestion[] {
    const p = prefix.trim().toLowerCase()
    if (!p) return []
    const like = `${p}%`

    const files = this.db
      .prepare(
        `SELECT id, name FROM files
         WHERE LOWER(name) LIKE ? ORDER BY name COLLATE NOCASE LIMIT 5`
      )
      .all(like) as Array<{ id: string; name: string }>

    const tags = this.db
      .prepare(
        `SELECT id, name FROM tags
         WHERE LOWER(name) LIKE ? ORDER BY name COLLATE NOCASE LIMIT 3`
      )
      .all(like) as Array<{ id: string; name: string }>

    return [
      ...tags.map<SearchSuggestion>((t) => ({
        kind: 'tag',
        text: t.name,
        id: t.id
      })),
      ...files.map<SearchSuggestion>((f) => ({
        kind: 'file',
        text: f.name,
        id: f.id
      }))
    ]
  }
}
