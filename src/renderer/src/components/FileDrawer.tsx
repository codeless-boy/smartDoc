import { useEffect, useState } from 'react'
import {
  Button,
  Descriptions,
  Drawer,
  Input,
  Select,
  Space,
  Typography,
  message
} from 'antd'
import { FolderOpenOutlined, DeleteOutlined } from '@ant-design/icons'
import type { FileWithTags, TagInfo } from '@shared/types'
import { useAppStore } from '@renderer/store/app-store'
import { refreshAll } from '@renderer/api/use-files'
import { TagChip } from './TagChip'

export function FileDrawer(): JSX.Element {
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
      <Space direction="vertical" style={{ width: '100%' }}>
        <Typography.Title level={5}>标签</Typography.Title>
        <Space wrap>
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

        <Typography.Title level={5}>备注</Typography.Title>
        <Input.TextArea
          rows={4}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={commitNote}
        />

        <Typography.Title level={5}>文件信息</Typography.Title>
        <Descriptions column={1} size="small">
          <Descriptions.Item label="大小">{file.size} B</Descriptions.Item>
          <Descriptions.Item label="导入时间">{file.importedAt}</Descriptions.Item>
          <Descriptions.Item label="路径">{file.storagePath}</Descriptions.Item>
        </Descriptions>

        <Space>
          <Button
            icon={<FolderOpenOutlined />}
            onClick={() => window.api.file.showInDir(file.id)}
          >
            定位文件
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
