import { Space, Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { FileWithTags } from '@shared/types'
import { useAppStore } from '@renderer/store/app-store'
import { fileIconFor } from './file-icon'
import { TagChip } from './TagChip'
import './file-table.css'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function formatDate(iso: string): string {
  return iso.slice(0, 10)
}

export function FileTable(): JSX.Element {
  const files = useAppStore((s) => s.files)
  const tags = useAppStore((s) => s.tags)
  const select = useAppStore((s) => s.select)
  const selectedId = useAppStore((s) => s.selectedId)
  const loading = useAppStore((s) => s.loading)

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
      loading={loading}
      pagination={false}
      size="middle"
      data-testid="file-table"
      rowClassName={(r, idx) =>
        `${r.id === selectedId ? 'row-selected' : ''} ${
          idx % 2 === 0 ? 'row-even' : 'row-odd'
        }`
      }
      onRow={(record) => ({
        onClick: () => select(record.id),
        onDoubleClick: () => {
          void window.api.file.open(record.id)
        }
      })}
    />
  )
}
