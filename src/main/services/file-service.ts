import path from 'node:path'
import fs from 'node:fs/promises'
import { v4 as uuidv4 } from 'uuid'
import type { Database } from 'better-sqlite3'
import type {
  FileInfo,
  FileWithTags,
  ImportRequest,
  ImportItemStatus,
  ListQuery
} from '@shared/types'
import { FileRepo } from '@main/repo/file-repo'
import { findDuplicateByName } from '@main/repo/duplicate'
import { nextSequenceName } from '@main/repo/sequence-name'

/** 文件大于此阈值时，导入过程会推送字节进度（设计文档第 6 节）。 */
const LARGE_FILE_THRESHOLD = 500 * 1024 * 1024

interface FileRow {
  id: string
  name: string
  ext: string
  size: number
  storage_path: string
  note: string
  imported_at: string
  updated_at: string
}

const rowToFile = (r: FileRow): FileInfo => ({
  id: r.id,
  name: r.name,
  ext: r.ext,
  size: r.size,
  storagePath: r.storage_path,
  note: r.note,
  importedAt: r.imported_at,
  updatedAt: r.updated_at
})

export class FileService {
  constructor(
    private readonly db: Database,
    private readonly repo: FileRepo
  ) {}

  private progressEmit:
    | ((p: { sourcePath: string; copied: number; total: number }) => void)
    | null = null

  setProgressEmitter(
    fn: (p: { sourcePath: string; copied: number; total: number }) => void
  ): void {
    this.progressEmit = fn
  }

  list(query: ListQuery): FileWithTags[] {
    const filter = query.filter ?? {}
    const where: string[] = []
    const params: unknown[] = []

    if (filter.keyword) {
      where.push(
        `(LOWER(files.name) LIKE ? OR LOWER(files.note) LIKE ? OR EXISTS (
          SELECT 1 FROM file_tags ft JOIN tags t ON t.id = ft.tag_id
          WHERE ft.file_id = files.id AND LOWER(t.name) LIKE ?
        ))`
      )
      const like = `%${filter.keyword.toLowerCase()}%`
      params.push(like, like, like)
    }

    if (filter.exts && filter.exts.length > 0) {
      where.push(`files.ext IN (${filter.exts.map(() => '?').join(',')})`)
      params.push(...filter.exts.map((e) => e.toLowerCase()))
    }

    if (filter.untagged) {
      where.push(
        `NOT EXISTS (SELECT 1 FROM file_tags ft WHERE ft.file_id = files.id)`
      )
    }

    if (filter.tagIds && filter.tagIds.length > 0) {
      where.push(`(
        SELECT COUNT(DISTINCT tag_id) FROM file_tags
        WHERE file_id = files.id AND tag_id IN (${filter.tagIds
          .map(() => '?')
          .join(',')})
      ) = ?`)
      params.push(...filter.tagIds, filter.tagIds.length)
    }

    let sql = `SELECT files.* FROM files`
    if (where.length > 0) sql += ` WHERE ${where.join(' AND ')}`

    if (filter.topOpenedLimit && filter.topOpenedLimit > 0) {
      sql = `
        SELECT files.* FROM files
        LEFT JOIN (
          SELECT file_id, COUNT(*) AS c FROM file_opens GROUP BY file_id
        ) o ON o.file_id = files.id
        ${where.length > 0 ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY COALESCE(o.c, 0) DESC, files.imported_at DESC
        LIMIT ?
      `
      params.push(filter.topOpenedLimit)
    } else {
      sql += ` ORDER BY files.imported_at DESC`
      if (query.limit) {
        sql += ` LIMIT ?`
        params.push(query.limit)
        if (query.offset) {
          sql += ` OFFSET ?`
          params.push(query.offset)
        }
      }
    }

    const rows = this.db.prepare(sql).all(...params) as FileRow[]
    if (rows.length === 0) return []

    const ids = rows.map((r) => r.id)
    const tagRows = this.db
      .prepare(
        `SELECT file_id, tag_id FROM file_tags
         WHERE file_id IN (${ids.map(() => '?').join(',')})`
      )
      .all(...ids) as Array<{ file_id: string; tag_id: string }>
    const tagsByFile = new Map<string, string[]>()
    for (const tr of tagRows) {
      const arr = tagsByFile.get(tr.file_id) ?? []
      arr.push(tr.tag_id)
      tagsByFile.set(tr.file_id, arr)
    }

    return rows.map((r) => ({
      ...rowToFile(r),
      tagIds: tagsByFile.get(r.id) ?? []
    }))
  }

  logOpen(fileId: string): void {
    this.db
      .prepare(
        'INSERT INTO file_opens (id, file_id, opened_at) VALUES (?, ?, ?)'
      )
      .run(uuidv4(), fileId, new Date().toISOString())
  }

  async import(req: ImportRequest): Promise<ImportItemStatus> {
    const sourceName = path.basename(req.sourcePath)
    const existingAll = this.list({ filter: {} })
    const existing = findDuplicateByName(sourceName, existingAll)

    if (existing && !req.duplicateAction) {
      return { status: 'duplicate', sourcePath: req.sourcePath, existing }
    }

    try {
      const stat = await fs.stat(req.sourcePath)
      const now = new Date().toISOString()

      if (existing && req.duplicateAction === 'skip') {
        return { status: 'skipped', sourcePath: req.sourcePath }
      }

      if (existing && req.duplicateAction === 'overwrite') {
        const storagePath = await this.repo.ingest({
          uuid: existing.id,
          sourcePath: req.sourcePath,
          name: existing.name,
          overwrite: true
        })
        this.db
          .prepare(
            'UPDATE files SET size=?, storage_path=?, updated_at=? WHERE id=?'
          )
          .run(stat.size, storagePath, now, existing.id)
        const row = this.db
          .prepare('SELECT * FROM files WHERE id=?')
          .get(existing.id) as FileRow
        return { status: 'overwritten', file: rowToFile(row) }
      }

      let finalName = sourceName
      if (existing && req.duplicateAction === 'keep-both') {
        const taken = new Set(existingAll.map((f) => f.name))
        finalName = nextSequenceName(sourceName, taken)
      }

      const uuid = uuidv4()
      const useProgress = stat.size > LARGE_FILE_THRESHOLD && this.progressEmit !== null
      const storagePath = await this.repo.ingest({
        uuid,
        sourcePath: req.sourcePath,
        name: finalName,
        totalBytes: useProgress ? stat.size : undefined,
        onProgress: useProgress
          ? (copied, total) =>
              this.progressEmit!({ sourcePath: req.sourcePath, copied, total })
          : undefined
      })
      const ext = (path.extname(finalName).slice(1) || '').toLowerCase()
      this.db
        .prepare(
          `INSERT INTO files (id,name,ext,size,storage_path,note,imported_at,updated_at)
           VALUES (?,?,?,?,?,?,?,?)`
        )
        .run(uuid, finalName, ext, stat.size, storagePath, '', now, now)
      const row = this.db
        .prepare('SELECT * FROM files WHERE id=?')
        .get(uuid) as FileRow
      return { status: 'imported', file: rowToFile(row) }
    } catch (err) {
      return {
        status: 'error',
        sourcePath: req.sourcePath,
        message: (err as Error).message
      }
    }
  }

  async delete(ids: string[]): Promise<void> {
    const tx = this.db.transaction((idList: string[]) => {
      const stmt = this.db.prepare('DELETE FROM files WHERE id=?')
      for (const id of idList) stmt.run(id)
    })
    tx(ids)
    await Promise.all(ids.map((id) => this.repo.remove(id)))
  }

  updateNote(id: string, note: string): FileInfo | null {
    const now = new Date().toISOString()
    this.db
      .prepare('UPDATE files SET note=?, updated_at=? WHERE id=?')
      .run(note, now, id)
    const row = this.db
      .prepare('SELECT * FROM files WHERE id=?')
      .get(id) as FileRow | undefined
    return row ? rowToFile(row) : null
  }

  async existsOnDisk(id: string): Promise<boolean> {
    const f = this.list({ filter: {} }).find((x) => x.id === id)
    if (!f) return false
    const parts = f.storagePath.split('/')
    // parts: ['files', uuid, name]  -- but name may itself contain segments. Re-join from index 2.
    return this.repo.exists(parts[1], parts.slice(2).join('/'))
  }
}
