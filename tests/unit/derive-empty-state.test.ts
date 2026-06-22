import { describe, it, expect } from 'vitest'
import { deriveEmptyState } from '@renderer/lib/derive-empty-state'
import type { FileFilter, FileWithTags } from '@shared/types'

const noFiles: FileWithTags[] = []
const oneFile: FileWithTags[] = [
  {
    id: 'a',
    name: 'a.pdf',
    ext: 'pdf',
    size: 1,
    storagePath: 'files/a/a.pdf',
    note: '',
    importedAt: 't',
    updatedAt: 't',
    tagIds: []
  }
]
const emptyFilter: FileFilter = {}

describe('deriveEmptyState', () => {
  it('returns null when files non-empty', () => {
    expect(deriveEmptyState(oneFile, false, emptyFilter)).toBeNull()
  })

  it('returns loading when loading=true regardless of files', () => {
    expect(deriveEmptyState(noFiles, true, emptyFilter)).toEqual({
      kind: 'loading'
    })
    expect(deriveEmptyState(oneFile, true, emptyFilter)).toEqual({
      kind: 'loading'
    })
  })

  it('returns onboarding when empty + empty filter', () => {
    expect(deriveEmptyState(noFiles, false, emptyFilter)).toEqual({
      kind: 'onboarding'
    })
  })

  it('returns no-match with keyword summary', () => {
    const r = deriveEmptyState(noFiles, false, { keyword: 'foo' })
    expect(r).toEqual({
      kind: 'no-match',
      activeFilters: ['关键词: "foo"']
    })
  })

  it('returns no-match with multiple filter summary', () => {
    const r = deriveEmptyState(noFiles, false, {
      keyword: 'foo',
      exts: ['pdf', 'png'],
      untagged: true,
      tagIds: ['t1', 't2']
    })
    expect(r).toEqual({
      kind: 'no-match',
      activeFilters: [
        '关键词: "foo"',
        '类型: pdf, png',
        '标签: 2 个',
        '未打标签'
      ]
    })
  })

  it('treats topOpenedLimit as active filter', () => {
    const r = deriveEmptyState(noFiles, false, { topOpenedLimit: 20 })
    expect(r).toEqual({
      kind: 'no-match',
      activeFilters: ['常用文档（前 20）']
    })
  })
})
