import { Space, Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { FileWithTags } from '@shared/types'
import { useAppStore } from '@renderer/store/app-store'
import { deriveEmptyState } from '@renderer/lib/derive-empty-state'
import { fileIconFor } from './file-icon'
import { TagChip } from './TagChip'
import { EmptyState } from './EmptyState'
import './file-table.css'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function formatDate(iso: string): string {
  return iso.slice(0, 10)
}

interface Props {
  pickAndImport: () => Promise<void>
}

export function FileTable({ pickAndImport }: Props): JSX.Element {
  const files = useAppStore((s) => s.files)
  const tags = useAppStore((s) => s.tags)
  const filter = useAppStore((s) => s.filter)
  const select = useAppStore((s) => s.select)
  const selectedId = useAppStore((s) => s.selectedId)
  const loading = useAppStore((s) => s.loading)

  const empty = deriveEmptyState(files, loading, filter)
  if (empty) {
    return <EmptyState state={empty} onImport={pickAndImport} />
  }

  const tagsById = new Map(tags.map((t) => [t.id, t] as const))

  const columns: ColumnsType<FileWithTags> = [
    {
      title: '文件名',
      key: 'name',
      render: (_v, record) => (
        <Space>
          {fileIconFor(record.ext)}
          <span>{record.name}</span>
          {record.tagIds.map((tid) => {
            const t = tagsById.get(tid)
            return t ? <TagChip key={tid} tag={t} /> : null
          })}
        </Space>
      )
    },
    {
      title: '大小',
      key: 'size',
      width: 100,
      render: (_v, r) => formatSize(r.size)
    },
    {
      title: '导入时间',
      key: 'importedAt',
      width: 120,
      render: (_v, r) => formatDate(r.importedAt)
    }
  ]

  return (
    <Table<FileWithTags>
      rowKey="id"
      columns={columns}
      dataSource={files}
      pagination={false}
      size="small"
      data-testid="file-table"
      rowClassName={(r) => (r.id === selectedId ? 'row-selected' : '')}
      onRow={(record) => ({
        onClick: () => select(record.id),
        onDoubleClick: async () => {
          const ok = await window.api.file.existsOnDisk(record.id)
          if (!ok) {
            const { message } = await import('antd')
            message.error('文件已丢失，无法打开')
            return
          }
          void window.api.file.open(record.id)
        },
        onContextMenu: (e: React.MouseEvent) => {
          e.preventDefault()
          select(record.id)
          useAppStore.getState().openContextMenu({ id: record.id, x: e.clientX, y: e.clientY })
        }
      })}
    />
  )
}
