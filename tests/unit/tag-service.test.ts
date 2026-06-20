import { describe, it, expect, beforeEach } from 'vitest'
import { openDatabase } from '@main/database'
import { TagService } from '@main/services/tag-service'
import type { Database } from 'better-sqlite3'

describe('TagService', () => {
  let db: Database
  let svc: TagService

  beforeEach(() => {
    db = openDatabase(':memory:')
    svc = new TagService(db)
    // 准备一个文件以便关联
    db.prepare(
      `INSERT INTO files (id,name,ext,size,storage_path,note,imported_at,updated_at)
       VALUES ('f1','a.pdf','pdf',1,'files/f1/a.pdf','','t','t')`
    ).run()
  })

  it('creates tag with default color', () => {
    const t = svc.create({ name: 'work' })
    expect(t.name).toBe('work')
    expect(t.color).toMatch(/^#/)
  })

  it('rejects duplicate tag name', () => {
    svc.create({ name: 'work' })
    expect(() => svc.create({ name: 'work' })).toThrow()
  })

  it('list returns tags ordered by name', () => {
    svc.create({ name: 'zeta' })
    svc.create({ name: 'alpha' })
    expect(svc.list().map((t) => t.name)).toEqual(['alpha', 'zeta'])
  })

  it('setOnFile replaces all tag associations atomically', () => {
    const t1 = svc.create({ name: 'a' })
    const t2 = svc.create({ name: 'b' })
    svc.setOnFile('f1', [t1.id, t2.id])
    expect(svc.tagsOfFile('f1').sort()).toEqual([t1.id, t2.id].sort())

    svc.setOnFile('f1', [t1.id])
    expect(svc.tagsOfFile('f1')).toEqual([t1.id])

    svc.setOnFile('f1', [])
    expect(svc.tagsOfFile('f1')).toEqual([])
  })

  it('update changes name and color', () => {
    const t = svc.create({ name: 'old' })
    const updated = svc.update(t.id, { name: 'new', color: '#ff0' })
    expect(updated.name).toBe('new')
    expect(updated.color).toBe('#ff0')
  })

  it('delete removes tag and cascades file_tags', () => {
    const t = svc.create({ name: 'work' })
    svc.setOnFile('f1', [t.id])
    svc.delete(t.id)
    expect(svc.list()).toHaveLength(0)
    expect(svc.tagsOfFile('f1')).toEqual([])
  })
})
