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
  filter?: FileFilter
  limit?: number
  offset?: number
}

export interface AppConfig {
  repoPath: string | null
  windowBounds?: { x?: number; y?: number; width: number; height: number }
}

export interface FileFilter {
  /** 文件名/备注/标签关键词；为空表示无关键词过滤 */
  keyword?: string
  /** 选中的标签 id 列表，命中需同时拥有所有这些标签（AND） */
  tagIds?: string[]
  /** 限定文件扩展名（小写，无点） */
  exts?: string[]
  /** 仅未打标签的文件 */
  untagged?: boolean
  /** 仅最常打开的前 N（基于 file_opens） */
  topOpenedLimit?: number
}

export interface SearchSuggestion {
  /** 'file' | 'tag' */
  kind: 'file' | 'tag'
  text: string
  /** 关联的 id（file id 或 tag id） */
  id: string
}

/** 详细描述每条文件附带的标签 id，避免 N+1 查询 */
export interface FileWithTags extends FileInfo {
  tagIds: string[]
}
