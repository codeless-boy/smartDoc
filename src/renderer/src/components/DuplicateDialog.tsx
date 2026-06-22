import { Button, Modal, Space, Typography } from 'antd'
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
        <Button key="skip" onClick={() => onChoose('skip')}>
          跳过
        </Button>,
        <Button key="overwrite" danger onClick={() => onChoose('overwrite')}>
          覆盖
        </Button>,
        <Button key="keep" type="primary" onClick={() => onChoose('keep-both')}>
          保留两份
        </Button>
      ]}
    >
      <Space direction="vertical">
        <Typography.Text>
          仓库中已有同名文件{' '}
          <Typography.Text strong>{existing.name}</Typography.Text>。
        </Typography.Text>
        <Typography.Text type="secondary">源：{sourcePath}</Typography.Text>
      </Space>
    </Modal>
  )
}
