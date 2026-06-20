import { useEffect, useMemo, useRef, useState } from 'react'
import { AutoComplete, Button, Input, Space } from 'antd'
import { ImportOutlined } from '@ant-design/icons'
import type { SearchSuggestion, ImportItemStatus } from '@shared/types'
import { useAppStore } from '@renderer/store/app-store'
import { refreshAll } from '@renderer/api/use-files'
import { DuplicateDialog } from './DuplicateDialog'

export function TopBar(): JSX.Element {
  const setKeyword = useAppStore((s) => s.setKeyword)
  const [draft, setDraft] = useState('')
  const [options, setOptions] = useState<{ value: string; label: string }[]>([])
  const [dup, setDup] = useState<{
    sourcePath: string
    existing: SearchSuggestion extends never ? never : import('@shared/types').FileInfo
  } | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  async function handleImport(paths: string[]): Promise<void> {
    for (const p of paths) {
      let result: ImportItemStatus = await window.api.file.import({ sourcePath: p })
      if (result.status === 'duplicate') {
        const action = await new Promise<'skip' | 'overwrite' | 'keep-both'>(
          (resolve) => {
            setDup({
              sourcePath: result.status === 'duplicate' ? result.sourcePath : p,
              existing:
                result.status === 'duplicate'
                  ? result.existing
                  : ({} as never)
            })
            ;(window as any).__smartdoc_dupResolver = resolve
          }
        )
        setDup(null)
        result = await window.api.file.import({ sourcePath: p, duplicateAction: action })
      }
    }
    await refreshAll()
  }

  async function pickAndImport(): Promise<void> {
    const paths = await window.api.dialog.pickFiles()
    if (paths.length > 0) await handleImport(paths)
  }

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
        />
      </AutoComplete>
      <Button
        type="primary"
        icon={<ImportOutlined />}
        onClick={pickAndImport}
      >
        导入文件
      </Button>
      {dup && (
        <DuplicateDialog
          open
          sourcePath={dup.sourcePath}
          existing={dup.existing}
          onChoose={(a) => (window as any).__smartdoc_dupResolver?.(a)}
          onCancel={() => (window as any).__smartdoc_dupResolver?.('skip')}
        />
      )}
    </Space>
  )
}
