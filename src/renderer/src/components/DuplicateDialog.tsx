import { Modal, Space, Typography } from 'antd'
import type { DuplicateAction, FileInfo } from '@shared/types'

interface Props {
  open: boolean
  sourcePath: string
  existing: FileInfo
  onChoose: (action: DuplicateAction) => void
  onCancel: () => void
}

export function DuplicateDialog({
  open,
  sourcePath,
  existing,
  onChoose,
  onCancel
}: Props): JSX.Element {
  return (
    <Modal
      title="文件已存在"
      open={open}
      onCancel={onCancel}
      footer={[
        <a key="skip" onClick={() => onChoose('skip')}>
          跳过
        </a>,
        <a key="overwrite" onClick={() => onChoose('overwrite')} style={{ marginLeft: 16 }}>
          覆盖
        </a>,
        <a key="keep" onClick={() => onChoose('keep-both')} style={{ marginLeft: 16 }}>
          保留两份
        </a>
      ]}
    >
      <Space direction="vertical">
        <Typography.Text>
          仓库中已有同名文件 <Typography.Text strong>{existing.name}</Typography.Text>。
        </Typography.Text>
        <Typography.Text type="secondary">
          源：{sourcePath}
        </Typography.Text>
      </Space>
    </Modal>
  )
}
