import { Button, Modal, Space, Typography } from 'antd'
import type { DuplicateAction, FileInfo } from '@shared/types'
import { FileOutlined } from '@ant-design/icons'

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
      <Space direction="vertical" size={12}>
        <Space align="center" size={8}>
          <FileOutlined style={{ fontSize: 20, color: '#8c8c8c' }} />
          <Typography.Text strong style={{ fontSize: 15 }}>
            {existing.name}
          </Typography.Text>
        </Space>
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
          仓库中已有同名文件。选择如何处理：
        </Typography.Text>
        <Typography.Text
          type="secondary"
          style={{
            fontSize: 12,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            wordBreak: 'break-all'
          }}
        >
          源：{sourcePath}
        </Typography.Text>
      </Space>
    </Modal>
  )
}
