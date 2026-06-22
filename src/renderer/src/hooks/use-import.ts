import { useCallback, useState } from 'react'
import type { FileInfo, ImportItemStatus } from '@shared/types'
import { refreshAll } from '@renderer/api/use-files'

interface DupTarget {
  sourcePath: string
  existing: FileInfo
}

/**
 * 共享的导入入口：弹文件选择器 → 逐个文件导入 → 重名时等待外部 resolver。
 *
 * 调用方（TopBar / EmptyState / 快捷键）共用同一函数；重名对话框由 TopBar 渲染，
 * 通过 `window.__smartdoc_dupResolver` 桥接 Promise（沿用 0.1.x 的方案）。
 */
export function useImport(): {
  pickAndImport: () => Promise<void>
  dup: DupTarget | null
  setDup: (d: DupTarget | null) => void
} {
  const [dup, setDup] = useState<DupTarget | null>(null)

  const pickAndImport = useCallback(async (): Promise<void> => {
    const paths = await window.api.dialog.pickFiles()
    if (paths.length === 0) return

    for (const p of paths) {
      let result: ImportItemStatus = await window.api.file.import({
        sourcePath: p
      })
      if (result.status === 'duplicate') {
        const dupSrc = result.sourcePath
        const dupExisting = result.existing
        const action = await new Promise<'skip' | 'overwrite' | 'keep-both'>(
          (resolve) => {
            setDup({ sourcePath: dupSrc, existing: dupExisting })
            ;(window as any).__smartdoc_dupResolver = resolve
          }
        )
        setDup(null)
        result = await window.api.file.import({
          sourcePath: p,
          duplicateAction: action
        })
      }
    }
    await refreshAll()
  }, [])

  return { pickAndImport, dup, setDup }
}
