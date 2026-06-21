import { describe, it, expect, beforeEach } from 'vitest'
import { openDatabase } from '@main/database'
import type Database from 'better-sqlite3'

describe('database', () => {
  let db: Database.Database

  beforeEach(() => {
    db = openDatabase(':memory:')
  })

  it('creates files / tags / file_tags / file_opens tables', () => {
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
      )
      .all() as Array<{ name: string }>
    const names = tables.map((t) => t.name)
    expect(names).toContain('files')
    expect(names).toContain('tags')
    expect(names).toContain('file_tags')
    expect(names).toContain('file_opens')
  })

  it('cascades file_tags when file deleted', () => {
    db.prepare(
      `INSERT INTO files (id,name,ext,size,storage_path,note,imported_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?)`
    ).run('f1', 'a.pdf', 'pdf', 1, 'files/f1/a.pdf', '', 't', 't')
    db.prepare(
      `INSERT INTO tags (id,name,color,created_at) VALUES (?,?,?,?)`
    ).run('t1', 'work', '#abc', 't')
    db.prepare(`INSERT INTO file_tags (file_id,tag_id) VALUES (?,?)`).run(
      'f1',
      't1'
    )

    db.prepare(`DELETE FROM files WHERE id=?`).run('f1')
    const rows = db.prepare(`SELECT * FROM file_tags`).all()
    expect(rows).toHaveLength(0)
  })

  it('enforces unique tag name', () => {
    db.prepare(
      `INSERT INTO tags (id,name,color,created_at) VALUES (?,?,?,?)`
    ).run('t1', 'work', '#abc', 't')
    expect(() =>
      db
        .prepare(`INSERT INTO tags (id,name,color,created_at) VALUES (?,?,?,?)`)
        .run('t2', 'work', '#abc', 't')
    ).toThrow(/UNIQUE/i)
  })
})
