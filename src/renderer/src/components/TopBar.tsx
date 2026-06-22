import { useEffect, useMemo, useRef, useState } from 'react'
import { AutoComplete, Button, Input, Space } from 'antd'
import { ImportOutlined } from '@ant-design/icons'
import { useAppStore } from '@renderer/store/app-store'
import { useImport } from '@renderer/hooks/use-import'
import { DuplicateDialog } from './DuplicateDialog'

export function TopBar(): JSX.Element {
  const setKeyword = useAppStore((s) => s.setKeyword)
  const [draft, setDraft] = useState('')
  const [options, setOptions] = useState<{ value: string; label: string }[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { pickAndImport, dup, setDup } = useImport()

  // 输入 → 300ms 防抖 → 写入 store.keyword 触发列表刷新
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setKeyword(draft.trim())
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [draft, setKeyword])

  const onSuggest = useMemo(
    () =>
      async (value: string): Promise<void> => {
        if (!value) {
          setOptions([])
          return
        }
        const list = await window.api.search.suggest(value)
        setOptions(
          list.map((s) => ({
            value: s.text,
            label: `${s.kind === 'tag' ? '🏷️ ' : ''}${s.text}`
          }))
        )
      },
    []
  )

  return (
    <Space style={{ padding: 12, width: '100%' }}>
      <AutoComplete
        options={options}
        onSearch={onSuggest}
        onSelect={(v) => setDraft(v)}
        style={{ width: 480 }}
      >
        <Input.Search
          placeholder="搜索文件名 / 标签 / 备注"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          allowClear
          data-testid="search-input"
        />
      </AutoComplete>
      <Button type="primary" icon={<ImportOutlined />} onClick={pickAndImport}>
        导入文件
      </Button>
      {dup && (
        <DuplicateDialog
          open
          sourcePath={dup.sourcePath}
          existing={dup.existing}
          onChoose={(a) => {
            ;(window as any).__smartdoc_dupResolver?.(a)
            setDup(null)
          }}
          onCancel={() => {
            ;(window as any).__smartdoc_dupResolver?.('skip')
            setDup(null)
          }}
        />
      )}
    </Space>
  )
}
