import path from 'node:path'
import fs from 'node:fs/promises'
import { v4 as uuidv4 } from 'uuid'
import type { Database } from 'better-sqlite3'
import type {
  FileInfo,
  ImportRequest,
  ImportItemStatus,
  ListQuery
} from '@shared/types'
import { FileRepo } from '@main/repo/file-repo'
import { findDuplicateByName } from '@main/repo/duplicate'
import { nextSequenceName } from '@main/repo/sequence-name'

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

  list(_query: ListQuery): FileInfo[] {
    const rows = this.db
      .prepare('SELECT * FROM files ORDER BY imported_at DESC')
      .all() as FileRow[]
    return rows.map(rowToFile)
  }

  /**
   * 导入一个文件。语义见 shared/types.ts 的 ImportItemStatus。
   *  - 未指定 duplicateAction 且重名 → 'duplicate'
   *  - 'skip' → 不动 db / 磁盘
   *  - 'overwrite' → 复用原 uuid，磁盘内容替换，标签/备注保留
   *  - 'keep-both' → 文件名加 (n) 序号，新 uuid
   */
  async import(req: ImportRequest): Promise<ImportItemStatus> {
    const sourceName = path.basename(req.sourcePath)
    const existingAll = this.list({})
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
          name: existing.name, // 保持磁盘名与 db.name 一致
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

      // 新增：keep-both 或 无重复
      let finalName = sourceName
      if (existing && req.duplicateAction === 'keep-both') {
        const taken = new Set(existingAll.map((f) => f.name))
        finalName = nextSequenceName(sourceName, taken)
      }

      const uuid = uuidv4()
      const storagePath = await this.repo.ingest({
        uuid,
        sourcePath: req.sourcePath,
        name: finalName
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
}
