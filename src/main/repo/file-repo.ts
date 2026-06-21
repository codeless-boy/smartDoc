import fs from 'node:fs/promises'
import { createReadStream, createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import path from 'node:path'

/**
 * 仓库目录布局：
 *   <root>/
 *     files/
 *       <uuid>/
 *         <原始文件名>
 *
 * 设计要点：
 *  - 每个文件独占 UUID 子目录，回避同名冲突。
 *  - 复制使用先写临时文件再 rename 的两步法，保证原子性。
 */
export class FileRepo {
  constructor(private root: string) {}

  /** 渲染端引导页选择目录后重新指向新根目录 */
  setRoot(root: string): void {
    this.root = root
  }

  /** 仓库内 files/ 子目录绝对路径 */
  filesDir(): string {
    return path.join(this.root, 'files')
  }

  /** 给定 uuid 与磁盘文件名，返回相对仓库根的路径，例如 "files/<uuid>/<name>" */
  storagePath(uuid: string, name: string): string {
    return path.posix.join('files', uuid, name)
  }

  /** 绝对路径版本 */
  absolutePath(uuid: string, name: string): string {
    return path.join(this.filesDir(), uuid, name)
  }

  /**
   * 把 source 复制到 files/<uuid>/<name>。返回相对仓库根的 storage_path。
   * 若目标目录已存在，按 overwrite=true 时清空后再写。
   *
   * 当传入 onProgress 与 totalBytes 时，改用流式拷贝并按 chunk 上报字节进度，
   * 适用于 >500MB 的大文件导入；否则走 fs.copyFile 快速路径。
   */
  async ingest(opts: {
    uuid: string
    sourcePath: string
    name: string
    overwrite?: boolean
    onProgress?: (copiedBytes: number, totalBytes: number) => void
    totalBytes?: number
  }): Promise<string> {
    const dir = path.join(this.filesDir(), opts.uuid)
    const dest = path.join(dir, opts.name)

    await fs.mkdir(dir, { recursive: true })
    if (opts.overwrite) {
      // 删除目录下所有旧文件，确保 dest 唯一
      const entries = await fs.readdir(dir).catch(() => [] as string[])
      await Promise.all(
        entries.map((e) => fs.rm(path.join(dir, e), { force: true }))
      )
    }

    const tmp = `${dest}.tmp-${process.pid}`
    try {
      if (opts.onProgress && opts.totalBytes) {
        const reader = createReadStream(opts.sourcePath)
        let copied = 0
        reader.on('data', (chunk) => {
          copied += chunk.length
          opts.onProgress!(copied, opts.totalBytes!)
        })
        await pipeline(reader, createWriteStream(tmp))
      } else {
        await fs.copyFile(opts.sourcePath, tmp)
      }
      await fs.rename(tmp, dest)
    } catch (err) {
      // 复制或 rename 失败时清理残留的 .tmp 文件，避免大文件场景下堆积 GB 级垃圾
      await fs.rm(tmp, { force: true })
      throw err
    }
    return this.storagePath(opts.uuid, opts.name)
  }

  /** 删除 files/<uuid>/ 整个目录（删除记录时调用） */
  async remove(uuid: string): Promise<void> {
    await fs.rm(path.join(this.filesDir(), uuid), {
      recursive: true,
      force: true
    })
  }

  /** 检查 files/<uuid>/<name> 是否存在 */
  async exists(uuid: string, name: string): Promise<boolean> {
    try {
      await fs.access(this.absolutePath(uuid, name))
      return true
    } catch {
      return false
    }
  }
}
