import { useEffect, useState } from 'react'
import type { ImportItemStatus } from '@shared/types'
import { refreshAll } from '@renderer/api/use-files'

interface Props {
  onDuplicate: (
    sourcePath: string,
    existing: import('@shared/types').FileInfo
  ) => Promise<'skip' | 'overwrite' | 'keep-both'>
}

/** 监听整个 window 的 dragover / drop，渲染半透明遮罩。 */
export function DropZone({ onDuplicate }: Props): JSX.Element | null {
  const [hovering, setHovering] = useState(false)

  useEffect(() => {
    let depth = 0
    function onEnter(e: DragEvent): void {
      e.preventDefault()
      depth++
      setHovering(true)
    }
    function onLeave(e: DragEvent): void {
      e.preventDefault()
      depth = Math.max(0, depth - 1)
      if (depth === 0) setHovering(false)
    }
    function onOver(e: DragEvent): void {
      e.preventDefault()
    }
    async function onDrop(e: DragEvent): Promise<void> {
      e.preventDefault()
      depth = 0
      setHovering(false)
      const files = e.dataTransfer?.files
      if (!files) return
      for (let i = 0; i < files.length; i++) {
        const f = files[i] as File & { path?: string }
        if (!f.path) continue
        let r: ImportItemStatus = await window.api.file.import({
          sourcePath: f.path
        })
        if (r.status === 'duplicate') {
          const action = await onDuplicate(r.sourcePath, r.existing)
          r = await window.api.file.import({
            sourcePath: f.path,
            duplicateAction: action
          })
        }
      }
      await refreshAll()
    }

    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('dragover', onOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [onDuplicate])

  if (!hovering) return null
  return (
    <div
      data-testid="drop-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(31, 31, 31, 0.06)',
        border: '3px dashed #1f1f1f',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none'
      }}
    >
      <div
        style={{
          background: 'rgba(255, 255, 255, 0.9)',
          padding: '16px 28px',
          borderRadius: 8,
          fontSize: 18,
          fontWeight: 500,
          color: '#1f1f1f',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
        }}
      >
        松开以导入
      </div>
    </div>
  )
}
