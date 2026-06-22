import { useEffect } from 'react'
import { Modal } from 'antd'
import { useAppStore } from '@renderer/store/app-store'
import { refreshAll } from '@renderer/api/use-files'
import { deriveEscAction } from '@renderer/lib/derive-esc-action'

/**
 * 集中管理全局键盘快捷键。在 AppShell 顶层调一次。
 *
 * 输入框/textarea 内按键 **不**触发全局快捷键（Esc 例外）。
 */
export function useShortcuts(pickAndImport: () => Promise<void>): void {
  useEffect(() => {
    function inEditable(t: EventTarget | null): boolean {
      if (!(t instanceof HTMLElement)) return false
      const tag = t.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return true
      if (t.isContentEditable) return true
      return false
    }

    function handler(e: KeyboardEvent): void {
      const editable = inEditable(e.target)

      // Esc 任何场景都响应（即使在输入框）
      if (e.key === 'Escape') {
        const s = useAppStore.getState()
        const action = deriveEscAction({
          selectedId: s.selectedId,
          keyword: s.keyword,
          hasFilter: hasActiveFilter(s.filter)
        })
        if (action === 'close-drawer') s.select(null)
        else if (action === 'clear-keyword') s.setKeyword('')
        else if (action === 'reset-filter') s.resetFilter()
        if (action) e.preventDefault()
        return
      }

      // 其它快捷键在编辑态时不响应
      if (editable) return

      // Ctrl+F 或 /  → 聚焦搜索框
      if ((e.ctrlKey && e.key.toLowerCase() === 'f') || e.key === '/') {
        const el = document.querySelector<HTMLInputElement>(
          '[data-testid="search-input"]'
        )
        if (el) {
          el.focus()
          el.select()
          e.preventDefault()
        }
        return
      }

      // Ctrl+I  → 触发导入
      if (e.ctrlKey && e.key.toLowerCase() === 'i') {
        e.preventDefault()
        void pickAndImport()
        return
      }

      // Delete  → 删除当前选中（带确认）
      if (e.key === 'Delete') {
        const s = useAppStore.getState()
        if (!s.selectedId) return
        const file = s.files.find((f) => f.id === s.selectedId)
        if (!file) return
        e.preventDefault()
        Modal.confirm({
          title: '删除文件',
          content: `确认删除「${file.name}」？此操作会同时移除磁盘文件。`,
          okText: '删除',
          okButtonProps: { danger: true },
          cancelText: '取消',
          onOk: async () => {
            await window.api.file.delete([file.id])
            useAppStore.getState().select(null)
            await refreshAll()
          }
        })
        return
      }

      // Enter  → 打开当前选中
      if (e.key === 'Enter') {
        const s = useAppStore.getState()
        if (!s.selectedId) return
        e.preventDefault()
        void window.api.file.open(s.selectedId)
        return
      }

      // ↑ / ↓  → 在文件列表中上下移动选中行
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        const s = useAppStore.getState()
        if (s.files.length === 0) return
        e.preventDefault()
        const idx = s.files.findIndex((f) => f.id === s.selectedId)
        let next: number
        if (idx < 0) next = e.key === 'ArrowDown' ? 0 : s.files.length - 1
        else next = idx + (e.key === 'ArrowDown' ? 1 : -1)
        next = Math.max(0, Math.min(s.files.length - 1, next))
        s.select(s.files[next].id)
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [pickAndImport])
}

function hasActiveFilter(
  f: ReturnType<typeof useAppStore.getState>['filter']
): boolean {
  return !!(
    f.keyword ||
    (f.tagIds && f.tagIds.length > 0) ||
    (f.exts && f.exts.length > 0) ||
    f.untagged ||
    f.topOpenedLimit
  )
}
