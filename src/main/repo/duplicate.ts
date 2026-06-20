import type { FileInfo } from '@shared/types'

/**
 * 在已存在文件列表中按文件名（含扩展名）大小写不敏感查找重复项。
 * 命中返回首条记录；未命中返回 null。
 */
export function findDuplicateByName(
  name: string,
  existing: readonly FileInfo[]
): FileInfo | null {
  const lower = name.toLowerCase()
  for (const f of existing) {
    if (f.name.toLowerCase() === lower) return f
  }
  return null
}
