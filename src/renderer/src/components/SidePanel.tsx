import { useMemo } from 'react'
import { Space, theme as antdTheme } from 'antd'
import { useAppStore } from '@renderer/store/app-store'
import { TagChip } from './TagChip'

const QUICK_PRESETS: Array<{
  key: string
  label: string
  apply: () => void
  active: (filter: ReturnType<typeof useAppStore.getState>['filter']) => boolean
}> = [
  {
    key: 'all',
    label: '全部',
    apply: () => useAppStore.getState().resetFilter(),
    active: (f) =>
      !f.untagged && !f.topOpenedLimit && !f.exts && !f.tagIds && !f.keyword
  },
  {
    key: 'untagged',
    label: '未打标签',
    apply: () => useAppStore.getState().patchFilter({ untagged: true }),
    active: (f) => !!f.untagged
  },
  {
    key: 'top',
    label: '常用文档',
    apply: () => useAppStore.getState().patchFilter({ topOpenedLimit: 20 }),
    active: (f) => !!f.topOpenedLimit
  }
]

function SectionLabel({
  children
}: {
  children: React.ReactNode
}): JSX.Element {
  const { token } = antdTheme.useToken()
  return (
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
      {children}
    </div>
  )
}

function FilterItem({
  label,
  active,
  onClick,
  testid
}: {
  label: string
  active: boolean
  onClick: () => void
  testid?: string
}): JSX.Element {
  const { token } = antdTheme.useToken()
  return (
    <a
      data-testid={testid}
      onClick={onClick}
      style={{
        display: 'block',
        padding: '4px 8px',
        margin: '0 -8px',
        borderRadius: 4,
        fontSize: 13,
        fontWeight: active ? 600 : 400,
        color: active ? token.colorPrimary : token.colorText,
        background: active ? token.colorBgLayout : 'transparent',
        cursor: 'pointer',
        transition: 'background 0.15s'
      }}
      onMouseEnter={(e) => {
        if (!active)
          (e.currentTarget as HTMLElement).style.background =
            token.colorBgLayout
      }}
      onMouseLeave={(e) => {
        if (!active) (e.currentTarget as HTMLElement).style.background = ''
      }}
    >
      {label}
    </a>
  )
}

export function SidePanel(): JSX.Element {
  const { token } = antdTheme.useToken()
  const files = useAppStore((s) => s.files)
  const tags = useAppStore((s) => s.tags)
  const filter = useAppStore((s) => s.filter)
  const patchFilter = useAppStore((s) => s.patchFilter)

  const extCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const f of files) m.set(f.ext, (m.get(f.ext) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [files])

  const selectedTagIds = filter.tagIds ?? []

  function toggleTag(id: string): void {
    const has = selectedTagIds.includes(id)
    const next = has
      ? selectedTagIds.filter((t) => t !== id)
      : [...selectedTagIds, id]
    patchFilter({ tagIds: next.length === 0 ? undefined : next })
  }

  function toggleExt(ext: string): void {
    const cur = filter.exts ?? []
    const has = cur.includes(ext)
    const next = has ? cur.filter((e) => e !== ext) : [...cur, ext]
    patchFilter({ exts: next.length === 0 ? undefined : next })
  }

  return (
    <div style={{ padding: 12 }}>
      <SectionLabel>快捷筛选</SectionLabel>
      <Space direction="vertical" size={2} style={{ width: '100%' }}>
        {QUICK_PRESETS.map((p) => (
          <FilterItem
            key={p.key}
            label={p.label}
            active={p.active(filter)}
            onClick={p.apply}
            testid={`quick-${p.key}`}
          />
        ))}
      </Space>

      <div
        style={{
          height: 1,
          background: token.colorBorderSecondary,
          margin: '16px 0'
        }}
      />
      <SectionLabel>类型</SectionLabel>
      <Space direction="vertical" size={2} style={{ width: '100%' }}>
        {extCounts.map(([ext, count]) => (
          <FilterItem
            key={ext}
            label={`.${ext} (${count})`}
            active={!!filter.exts?.includes(ext)}
            onClick={() => toggleExt(ext)}
            testid={`ext-${ext}`}
          />
        ))}
      </Space>

      <div
        style={{
          height: 1,
          background: token.colorBorderSecondary,
          margin: '16px 0'
        }}
      />
      <SectionLabel>标签</SectionLabel>
      <Space wrap>
        {tags.map((t) => (
          <TagChip
            key={t.id}
            tag={t}
            onClick={() => toggleTag(t.id)}
            selected={selectedTagIds.includes(t.id)}
          />
        ))}
      </Space>
    </div>
  )
}
