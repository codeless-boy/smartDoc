import { useEffect, useState } from 'react'
import { Progress, Space, Typography } from 'antd'

interface Item {
  sourcePath: string
  copied: number
  total: number
}

/** 在导入大文件期间渲染右下角浮窗。监听 file:importProgress。 */
export function ImportProgress(): JSX.Element | null {
  const [items, setItems] = useState<Map<string, Item>>(new Map())

  useEffect(() => {
    const off = window.api.file.onImportProgress((p) => {
      setItems((prev) => {
        const next = new Map(prev)
        if (p.copied >= p.total) next.delete(p.sourcePath)
        else next.set(p.sourcePath, p)
        return next
      })
    })
    return off
  }, [])

  if (items.size === 0) return null

  return (
    <div
      data-testid="import-progress"
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        background: '#fff',
        border: '1px solid #ddd',
        padding: 12,
        borderRadius: 6,
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        minWidth: 260
      }}
    >
      <Space direction="vertical" style={{ width: '100%' }}>
        {[...items.values()].map((it) => (
          <Space.Compact key={it.sourcePath} block direction="vertical">
            <Typography.Text ellipsis style={{ maxWidth: 240 }}>
              {it.sourcePath.split(/[\\/]/).pop()}
            </Typography.Text>
            <Progress
              percent={Math.floor((it.copied / it.total) * 100)}
              size="small"
            />
          </Space.Compact>
        ))}
      </Space>
    </div>
  )
}
