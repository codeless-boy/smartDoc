import { useState } from 'react'
import { Button, Result, Space, Typography } from 'antd'
import { FolderOpenOutlined } from '@ant-design/icons'

interface Props {
  /** 调用方完成选择后回调；交由父组件触发刷新。 */
  onChosen: () => void
}

/**
 * 在 repoPath 为空时显示。点击按钮 → 调用新增 IPC `dialog:pickDirectory`
 * → 写入 config.repoPath → 通知父组件刷新。
 */
export function FirstRunGuide({ onChosen }: Props): JSX.Element {
  const [busy, setBusy] = useState(false)

  async function pick(): Promise<void> {
    setBusy(true)
    try {
      const dir = await window.api.dialog.pickDirectory()
      if (!dir) return
      await window.api.config.set('repoPath', dir)
      onChosen()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Result
      icon={<FolderOpenOutlined />}
      title="欢迎使用 smartDoc"
      subTitle="请先选择一个仓库目录用于存放导入的文件。所有文件会复制到该目录的 files/ 子目录中。"
      extra={
        <Space>
          <Button
            type="primary"
            loading={busy}
            onClick={pick}
            data-testid="first-run-pick"
          >
            选择仓库目录
          </Button>
          <Typography.Text type="secondary">建议选择一个空目录</Typography.Text>
        </Space>
      }
    />
  )
}
