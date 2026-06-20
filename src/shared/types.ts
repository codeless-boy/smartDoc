// 单一事实来源：跨 main / preload / renderer 共享的数据契约。

export interface FileInfo {
  id: string                  // UUID
  name: string                // 含扩展名的原始文件名
  ext: string                 // 小写扩展名（不含点），如 "pdf"
  size: number                // 字节数
  storagePath: string         // 仓库内相对路径，如 "files/<uuid>/<name>"
  note: string
  importedAt: string          // ISO8601
  updatedAt: string
}

export interface TagInfo {
  id: string
  name: string
  color: string
  createdAt: string
}

export type DuplicateAction = 'skip' | 'overwrite' | 'keep-both'

export interface ImportRequest {
  sourcePath: string          // 源文件绝对路径
  /**
   * 若为 undefined：检测到重名时返回 status='duplicate'，由 UI 询问后再次调用。
   * 若已设置：按该策略处理。
   */
  duplicateAction?: DuplicateAction
}

export type ImportItemStatus =
  | { status: 'imported'; file: FileInfo }
  | { status: 'duplicate'; sourcePath: string; existing: FileInfo }
  | { status: 'skipped'; sourcePath: string }
  | { status: 'overwritten'; file: FileInfo }
  | { status: 'error'; sourcePath: string; message: string }

export interface ListQuery {
  /** 关键词（搜索 Part 2 启用），Part 1 仅支持 undefined */
  keyword?: string
  /** 分页（Part 2 启用） */
  limit?: number
  offset?: number
}

export interface AppConfig {
  repoPath: string | null
  windowBounds?: { x?: number; y?: number; width: number; height: number }
}
