import { useEffect, useMemo, useRef, useState } from 'react'
import { AutoComplete, Input } from 'antd'
import { useAppStore } from '@renderer/store/app-store'

interface Props {
  pickAndImport: () => Promise<void>
}

/**
 * 顶部搜索栏 + 导入按钮。
 *
 * 布局约定（与 AppShell 协作）：
 *  - TopBar 仅渲染 Header 右侧区域（即 Sider 之后的部分）。
 *  - Header 左侧 220px 留给 Sider 头部（当前留空，仅竖直分隔线）。
 *  - 搜索框 / 快捷键提示 / 导入按钮三者高度 36px、垂直居中。
 *  - 搜索框左边对齐 Content 内 padding（12px），右边按钮对齐 Content 右 padding。
 *
 * 视觉风格：干净克制（参见 theme.ts）。搜索框为无边框 pill，聚焦时显式黑边 + 极淡光晕。
 */
export function TopBar({ pickAndImport }: Props): JSX.Element {
  const setKeyword = useAppStore((s) => s.setKeyword)
  const [draft, setDraft] = useState('')
  const [focused, setFocused] = useState(false)
  const [options, setOptions] = useState<{ value: string; label: string }[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
            label: s.kind === 'tag' ? `标签 · ${s.text}` : s.text
          }))
        )
      },
    []
  )

  return (
    <div
      style={{
        flex: 1,
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '0 12px',
        minWidth: 0
      }}
    >
      <AutoComplete
        options={options}
        onSearch={onSuggest}
        onSelect={(v) => setDraft(v)}
        style={{ flex: 1, maxWidth: 720, minWidth: 0 }}
      >
        <Input
          placeholder="搜索文件名 / 标签 / 备注"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          allowClear
          variant="filled"
          data-testid="search-input"
          prefix={<SearchPrefixIcon />}
          style={{
            height: 36,
            borderRadius: 8,
            background: focused ? '#ffffff' : '#f0f1f3',
            borderColor: focused ? '#1f1f1f' : 'transparent',
            boxShadow: focused ? '0 0 0 3px rgba(31,31,31,0.04)' : 'none',
            transition: 'background 0.15s, border-color 0.15s, box-shadow 0.15s'
          }}
        />
      </AutoComplete>
      <KeyboardHint />
      <ImportButton onClick={pickAndImport} />
    </div>
  )
}

/** SVG 搜索图标（替代 emoji 🔍），inline 渲染避免再开依赖。 */
function SearchPrefixIcon(): JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="#8c8c8c"
      strokeWidth="1.6"
      strokeLinecap="round"
      style={{ flexShrink: 0 }}
      aria-hidden="true"
    >
      <circle cx="7" cy="7" r="5" />
      <path d="m11 11 3 3" />
    </svg>
  )
}

/** Header 区域占位符——SearchPrefixIcon 已经画了搜索镜，这里仅占位用，不渲染任何东西。 */
function SearchIcon(): null {
  return null
}

/** Ctrl+F 快捷键提示。窗口窄时由 CSS media query 隐藏。 */
function KeyboardHint(): JSX.Element {
  return (
    <div
      className="topbar-kbd-hint"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        color: '#8c8c8c',
        fontSize: 11,
        flexShrink: 0,
        userSelect: 'none'
      }}
      aria-hidden="true"
    >
      <Kbd>Ctrl</Kbd>
      <span>+</span>
      <Kbd>F</Kbd>
    </div>
  )
}

function Kbd({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <span
      style={{
        background: '#f0f1f3',
        border: '1px solid #e0e0e0',
        borderBottomWidth: 2,
        borderRadius: 4,
        padding: '1px 5px',
        fontSize: 10,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        color: '#595959',
        lineHeight: 1
      }}
    >
      {children}
    </span>
  )
}

function ImportButton({
  onClick
}: {
  onClick: () => Promise<void>
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={() => void onClick()}
      style={{
        height: 36,
        padding: '0 14px',
        background: '#1f1f1f',
        color: '#ffffff',
        border: 'none',
        borderRadius: 8,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 13,
        fontWeight: 500,
        cursor: 'pointer',
        flexShrink: 0,
        transition: 'background 0.15s'
      }}
      onMouseEnter={(e) => {
        ;(e.currentTarget as HTMLButtonElement).style.background = '#000000'
      }}
      onMouseLeave={(e) => {
        ;(e.currentTarget as HTMLButtonElement).style.background = '#1f1f1f'
      }}
    >
      <ImportSvg />
      <span>导入文件</span>
    </button>
  )
}

function ImportSvg(): JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 2v9" />
      <path d="M4 7l4 4 4-4" />
      <path d="M2 13h12" />
    </svg>
  )
}
