import { useMemo } from 'react'
import { Space, Typography, theme as antdTheme } from 'antd'
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
      <Typography.Title level={5}>⚡ 快捷筛选</Typography.Title>
      <Space direction="vertical">
        {QUICK_PRESETS.map((p) => (
          <a
            key={p.key}
            data-testid={`quick-${p.key}`}
            onClick={p.apply}
            style={{ fontWeight: p.active(filter) ? 600 : 400 }}
          >
            {p.label}
          </a>
        ))}
      </Space>

      <div
        style={{
          height: 1,
          background: token.colorBorderSecondary,
          margin: '16px 0'
        }}
      />
      <Typography.Title level={5}>📑 类型</Typography.Title>
      <Space direction="vertical">
        {extCounts.map(([ext, count]) => (
          <a
            key={ext}
            data-testid={`ext-${ext}`}
            onClick={() => toggleExt(ext)}
            style={{
              fontWeight: filter.exts?.includes(ext) ? 600 : 400
            }}
          >
            .{ext} ({count})
          </a>
        ))}
      </Space>

      <div
        style={{
          height: 1,
          background: token.colorBorderSecondary,
          margin: '16px 0'
        }}
      />
      <Typography.Title level={5}>🏷️ 标签</Typography.Title>
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
