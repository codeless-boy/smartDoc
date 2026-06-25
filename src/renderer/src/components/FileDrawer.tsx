import { useEffect, useState } from 'react'
import {
  Button,
  Descriptions,
  Drawer,
  Input,
  Select,
  Space,
  Typography,
  message,
  theme as antdTheme
} from 'antd'
import { FileOutlined, DeleteOutlined } from '@ant-design/icons'
import type { FileWithTags, TagInfo } from '@shared/types'
import { useAppStore } from '@renderer/store/app-store'
import { refreshAll } from '@renderer/api/use-files'
import { TagChip } from './TagChip'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

export function FileDrawer(): JSX.Element {
  const { token } = antdTheme.useToken()
  const selectedId = useAppStore((s) => s.selectedId)
  const select = useAppStore((s) => s.select)
  const files = useAppStore((s) => s.files)
  const tags = useAppStore((s) => s.tags)
  const file: FileWithTags | undefined = files.find((f) => f.id === selectedId)

  const [note, setNote] = useState('')
  const [pendingTagIds, setPendingTagIds] = useState<string[]>([])

  useEffect(() => {
    if (file) {
      setNote(file.note)
      setPendingTagIds(file.tagIds)
    }
  }, [file?.id])

  if (!file) return <Drawer open={false} onClose={() => undefined} />

  async function commitNote(): Promise<void> {
    await window.api.file.update(file!.id, { note })
    await refreshAll()
    message.success('备注已保存')
  }

  async function commitTags(next: string[]): Promise<void> {
    setPendingTagIds(next)
    await window.api.tag.setOnFile(file!.id, next)
    await refreshAll()
  }

  async function createAndApplyTag(name: string): Promise<void> {
    if (!name.trim()) return
    const t: TagInfo = await window.api.tag.create({ name: name.trim() })
    await commitTags([...pendingTagIds, t.id])
  }

  return (
    <Drawer
      open={!!selectedId}
      onClose={() => select(null)}
      width={320}
      title={file.name}
      data-testid="file-drawer"
    >
      <Space direction="vertical" size={24} style={{ width: '100%' }}>
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: token.colorTextTertiary,
              marginBottom: 8
            }}
          >
            标签
          </div>
          <Space wrap style={{ marginBottom: 8 }}>
            {pendingTagIds.map((tid) => {
              const t = tags.find((x) => x.id === tid)
              return t ? (
                <TagChip
                  key={tid}
                  tag={t}
                  closable
                  onClose={() =>
                    commitTags(pendingTagIds.filter((x) => x !== tid))
                  }
                />
              ) : null
            })}
          </Space>
          <Select
            mode="tags"
            style={{ width: '100%' }}
            placeholder="添加标签（回车提交）"
            value={[]}
            onSelect={(value: string) => {
              const known = tags.find((t) => t.name === value)
              if (known) commitTags([...pendingTagIds, known.id])
              else void createAndApplyTag(value)
            }}
            options={tags
              .filter((t) => !pendingTagIds.includes(t.id))
              .map((t) => ({ label: t.name, value: t.name }))}
          />
        </div>

        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: token.colorTextTertiary,
              marginBottom: 8
            }}
          >
            备注
          </div>
          <Input.TextArea
            rows={4}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={commitNote}
            placeholder="添加备注…"
          />
        </div>

        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: token.colorTextTertiary,
              marginBottom: 8
            }}
          >
            文件信息
          </div>
          <Descriptions
            column={1}
            size="small"
            labelStyle={{ color: token.colorTextTertiary, fontSize: 12 }}
          >
            <Descriptions.Item label="大小">
              {formatSize(file.size)}
            </Descriptions.Item>
            <Descriptions.Item label="导入时间">
              {file.importedAt}
            </Descriptions.Item>
            <Descriptions.Item label="路径">
              {file.storagePath}
            </Descriptions.Item>
          </Descriptions>
        </div>

        <Space size={8}>
          <Button
            type="primary"
            icon={<FileOutlined />}
            onClick={() => window.api.file.open(file.id)}
          >
            打开文件
          </Button>
          <Button
            danger
            icon={<DeleteOutlined />}
            onClick={async () => {
              await window.api.file.delete([file.id])
              select(null)
              await refreshAll()
            }}
          >
            删除
          </Button>
        </Space>
      </Space>
    </Drawer>
  )
}
