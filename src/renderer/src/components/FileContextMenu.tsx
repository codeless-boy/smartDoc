import { Dropdown, Modal, message, type MenuProps } from 'antd'
import { useEffect } from 'react'
import { useAppStore } from '@renderer/store/app-store'
import { refreshAll } from '@renderer/api/use-files'

export function FileContextMenu(): JSX.Element | null {
  const target = useAppStore((s) => s.contextMenuTarget)
  const close = useAppStore((s) => s.closeContextMenu)
  const files = useAppStore((s) => s.files)
  const select = useAppStore((s) => s.select)

  // 滚动表格、Esc 时关闭菜单
  useEffect(() => {
    if (!target) return
    function onScroll(): void {
      close()
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [target, close])

  if (!target) return null
  const file = files.find((f) => f.id === target.id)
  if (!file) return null

  const items: MenuProps['items'] = [
    {
      key: 'open',
      label: '打开文件',
      onClick: () => {
        void window.api.file.open(file.id)
        close()
      }
    },
    {
      key: 'reveal',
      label: '在文件夹中定位',
      onClick: () => {
        void window.api.file.showInDir(file.id)
        close()
      }
    },
    { type: 'divider' },
    {
      key: 'copy-name',
      label: '复制文件名',
      onClick: async () => {
        await navigator.clipboard.writeText(file.name)
        message.success('已复制文件名')
        close()
      }
    },
    {
      key: 'copy-path',
      label: '复制路径',
      onClick: async () => {
        const abs = await window.api.file.getAbsolutePath(file.id)
        if (abs) {
          await navigator.clipboard.writeText(abs)
          message.success('已复制路径')
        }
        close()
      }
    },
    { type: 'divider' },
    {
      key: 'edit-tags',
      label: '编辑标签',
      onClick: () => {
        select(file.id)
        close()
      }
    },
    { type: 'divider' },
    {
      key: 'delete',
      label: '删除',
      danger: true,
      onClick: () => {
        close()
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
      }
    }
  ]

  return (
    <Dropdown
      menu={{ items }}
      open
      onOpenChange={(open) => {
        if (!open) close()
      }}
    >
      <span
        data-testid="ctx-anchor"
        style={{
          position: 'fixed',
          left: target.x,
          top: target.y,
          width: 1,
          height: 1
        }}
      />
    </Dropdown>
  )
}
