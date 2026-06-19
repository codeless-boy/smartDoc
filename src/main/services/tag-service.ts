import { v4 as uuidv4 } from 'uuid'
import type { Database } from 'better-sqlite3'
import type { TagInfo } from '@shared/types'

interface TagRow {
  id: string
  name: string
  color: string
  created_at: string
}

const rowToTag = (r: TagRow): TagInfo => ({
  id: r.id,
  name: r.name,
  color: r.color,
  createdAt: r.created_at
})

export class TagService {
  constructor(private readonly db: Database) {}

  list(): TagInfo[] {
    const rows = this.db
      .prepare('SELECT * FROM tags ORDER BY name COLLATE NOCASE')
      .all() as TagRow[]
    return rows.map(rowToTag)
  }

  create(input: { name: string; color?: string }): TagInfo {
    const id = uuidv4()
    const color = input.color ?? '#6366f1'
    const now = new Date().toISOString()
    this.db
      .prepare(
        'INSERT INTO tags (id, name, color, created_at) VALUES (?, ?, ?, ?)'
      )
      .run(id, input.name, color, now)
    const row = this.db.prepare('SELECT * FROM tags WHERE id=?').get(id) as TagRow
    return rowToTag(row)
  }

  update(id: string, fields: { name?: string; color?: string }): TagInfo {
    const sets: string[] = []
    const params: unknown[] = []
    if (fields.name !== undefined) {
      sets.push('name=?')
      params.push(fields.name)
    }
    if (fields.color !== undefined) {
      sets.push('color=?')
      params.push(fields.color)
    }
    if (sets.length === 0) {
      const r = this.db.prepare('SELECT * FROM tags WHERE id=?').get(id) as TagRow
      return rowToTag(r)
    }
    params.push(id)
    this.db.prepare(`UPDATE tags SET ${sets.join(', ')} WHERE id=?`).run(...params)
    const row = this.db.prepare('SELECT * FROM tags WHERE id=?').get(id) as TagRow
    return rowToTag(row)
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM tags WHERE id=?').run(id)
  }

  /** 替换文件的标签集合：原子操作（事务内删旧插新） */
  setOnFile(fileId: string, tagIds: string[]): void {
    const tx = this.db.transaction((fid: string, ids: string[]) => {
      this.db.prepare('DELETE FROM file_tags WHERE file_id=?').run(fid)
      const insert = this.db.prepare(
        'INSERT INTO file_tags (file_id, tag_id) VALUES (?, ?)'
      )
      for (const tid of ids) insert.run(fid, tid)
    })
    tx(fileId, tagIds)
  }

  tagsOfFile(fileId: string): string[] {
    const rows = this.db
      .prepare('SELECT tag_id FROM file_tags WHERE file_id=?')
      .all(fileId) as Array<{ tag_id: string }>
    return rows.map((r) => r.tag_id)
  }
}
