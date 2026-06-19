import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { openDatabase } from '@main/database'
import { FileRepo } from '@main/repo/file-repo'
import { FileService } from '@main/services/file-service'
import type { Database } from 'better-sqlite3'

describe('FileService', () => {
  let db: Database
  let repoRoot: string
  let srcDir: string
  let svc: FileService

  beforeEach(async () => {
    db = openDatabase(':memory:')
    repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'smartdoc-repo-'))
    srcDir = await fs.mkdtemp(path.join(os.tmpdir(), 'smartdoc-src-'))
    svc = new FileService(db, new FileRepo(repoRoot))
  })

  afterEach(async () => {
    db.close()
    await fs.rm(repoRoot, { recursive: true, force: true })
    await fs.rm(srcDir, { recursive: true, force: true })
  })

  async function writeSource(name: string, content = 'hello'): Promise<string> {
    const p = path.join(srcDir, name)
    await fs.writeFile(p, content)
    return p
  }

  it('imports a new file: writes db row and copies bytes', async () => {
    const src = await writeSource('a.pdf', 'pdf-bytes')
    const result = await svc.import({ sourcePath: src })

    expect(result.status).toBe('imported')
    if (result.status !== 'imported') return
    expect(result.file.name).toBe('a.pdf')
    expect(result.file.ext).toBe('pdf')
    expect(result.file.size).toBe('pdf-bytes'.length)
    const onDisk = await fs.readFile(path.join(repoRoot, result.file.storagePath), 'utf8')
    expect(onDisk).toBe('pdf-bytes')
  })

  it('detects duplicate by name (case-insensitive) without action', async () => {
    await svc.import({ sourcePath: await writeSource('Doc.pdf') })
    const result = await svc.import({ sourcePath: await writeSource('doc.pdf') })
    expect(result.status).toBe('duplicate')
    if (result.status !== 'duplicate') return
    expect(result.existing.name).toBe('Doc.pdf')
  })

  it('skip leaves db and disk unchanged', async () => {
    const src = await writeSource('a.pdf')
    await svc.import({ sourcePath: src })
    const before = svc.list({ filter: {} })
    const result = await svc.import({ sourcePath: src, duplicateAction: 'skip' })
    expect(result.status).toBe('skipped')
    expect(svc.list({ filter: {} })).toEqual(before)
  })

  it('overwrite reuses uuid, updates size, preserves note', async () => {
    const src1 = await writeSource('a.pdf', 'v1')
    const r1 = await svc.import({ sourcePath: src1 })
    if (r1.status !== 'imported') throw new Error('setup failed')
    db.prepare('UPDATE files SET note=? WHERE id=?').run('keep me', r1.file.id)

    const src2 = await writeSource('a.pdf', 'v2-longer')
    // overwrite 时源是同一文件名，但内容不同；先把 src2 改名以避免与 src1 同路径冲突
    const src2b = path.join(srcDir, 'a-v2.pdf')
    await fs.rename(src2, src2b)
    // 重命名仅为产生新的 source 文件；service 仍按 basename 'a-v2.pdf' 检查重复，
    // 故测试中显式用旧 name 触发重复：复制成同名后再调用
    const sameName = path.join(srcDir, 'a.pdf')
    await fs.writeFile(sameName, 'v2-longer')
    const r2 = await svc.import({ sourcePath: sameName, duplicateAction: 'overwrite' })

    expect(r2.status).toBe('overwritten')
    if (r2.status !== 'overwritten') return
    expect(r2.file.id).toBe(r1.file.id)
    expect(r2.file.size).toBe('v2-longer'.length)
    const note = db.prepare('SELECT note FROM files WHERE id=?').get(r1.file.id) as {
      note: string
    }
    expect(note.note).toBe('keep me')
  })

  it('keep-both creates new uuid with sequence-named file', async () => {
    await svc.import({ sourcePath: await writeSource('a.pdf', 'v1') })
    const r2 = await svc.import({
      sourcePath: await writeSource('a.pdf', 'v2'),
      duplicateAction: 'keep-both'
    })
    expect(r2.status).toBe('imported')
    if (r2.status !== 'imported') return
    expect(r2.file.name).toBe('a (2).pdf')
    const onDisk = await fs.readFile(path.join(repoRoot, r2.file.storagePath), 'utf8')
    expect(onDisk).toBe('v2')
  })

  it('list returns rows ordered by imported_at desc', async () => {
    const a = await svc.import({ sourcePath: await writeSource('a.pdf') })
    // 通过手动改时间戳模拟先后顺序
    if (a.status === 'imported') {
      db.prepare('UPDATE files SET imported_at=? WHERE id=?').run(
        '2020-01-01T00:00:00.000Z',
        a.file.id
      )
    }
    await svc.import({ sourcePath: await writeSource('b.pdf') })
    const rows = svc.list({ filter: {} })
    expect(rows.map((r) => r.name)).toEqual(['b.pdf', 'a.pdf'])
  })

  it('delete removes db row and disk dir', async () => {
    const r = await svc.import({ sourcePath: await writeSource('a.pdf') })
    if (r.status !== 'imported') throw new Error('setup failed')
    await svc.delete([r.file.id])
    expect(svc.list({ filter: {} })).toHaveLength(0)
    expect(await fs.readdir(path.join(repoRoot, 'files'))).toHaveLength(0)
  })

  it('filter by keyword matches name (case-insensitive)', async () => {
    await svc.import({ sourcePath: await writeSource('Report.pdf') })
    await svc.import({ sourcePath: await writeSource('photo.jpg') })
    const rows = svc.list({ filter: { keyword: 'report' } })
    expect(rows.map((r) => r.name)).toEqual(['Report.pdf'])
  })

  it('filter by exts narrows result', async () => {
    await svc.import({ sourcePath: await writeSource('a.pdf') })
    await svc.import({ sourcePath: await writeSource('b.png') })
    const rows = svc.list({ filter: { exts: ['png'] } })
    expect(rows.map((r) => r.name)).toEqual(['b.png'])
  })

  it('logOpen records into file_opens', async () => {
    const r = await svc.import({ sourcePath: await writeSource('a.pdf') })
    if (r.status !== 'imported') throw new Error('setup')
    svc.logOpen(r.file.id)
    svc.logOpen(r.file.id)
    const cnt = (db
      .prepare('SELECT COUNT(*) AS c FROM file_opens WHERE file_id=?')
      .get(r.file.id) as { c: number }).c
    expect(cnt).toBe(2)
  })

  it('list returns each row with tagIds (empty by default)', async () => {
    await svc.import({ sourcePath: await writeSource('a.pdf') })
    const rows = svc.list({ filter: {} })
    expect(rows[0].tagIds).toEqual([])
  })
})
