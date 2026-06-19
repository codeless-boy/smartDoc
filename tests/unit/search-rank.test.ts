import { describe, it, expect } from 'vitest'
import { rankFiles } from '@main/repo/search-rank'
import type { FileWithTags } from '@shared/types'

const make = (
  partial: Partial<FileWithTags> & Pick<FileWithTags, 'id' | 'name'>
): FileWithTags => ({
  ext: 'pdf',
  size: 1,
  storagePath: '',
  note: '',
  importedAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  tagIds: [],
  ...partial
})

describe('rankFiles', () => {
  it('exact name match wins over partial', () => {
    const exact = make({ id: '1', name: 'foo.pdf' })
    const partial = make({ id: '2', name: 'foobar.pdf' })
    const ranked = rankFiles([partial, exact], {
      keyword: 'foo.pdf',
      tagNamesById: new Map()
    })
    expect(ranked[0].id).toBe('1')
  })

  it('name partial match outranks tag match', () => {
    const tagOnly = make({ id: 'tag', name: 'unrelated.pdf', tagIds: ['t1'] })
    const namePartial = make({ id: 'name', name: 'plan.pdf' })
    const ranked = rankFiles([tagOnly, namePartial], {
      keyword: 'plan',
      tagNamesById: new Map([['t1', 'planning']])
    })
    expect(ranked[0].id).toBe('name')
  })

  it('tag match outranks note match', () => {
    const noteHit = make({ id: 'note', name: 'a.pdf', note: 'plan b' })
    const tagHit = make({ id: 'tag', name: 'b.pdf', tagIds: ['t1'] })
    const ranked = rankFiles([noteHit, tagHit], {
      keyword: 'plan',
      tagNamesById: new Map([['t1', 'plan']])
    })
    expect(ranked[0].id).toBe('tag')
  })

  it('case-insensitive', () => {
    const exact = make({ id: '1', name: 'Report.PDF' })
    const ranked = rankFiles([exact], {
      keyword: 'report.pdf',
      tagNamesById: new Map()
    })
    expect(ranked[0].id).toBe('1')
  })

  it('empty keyword preserves input order', () => {
    const a = make({ id: 'a', name: 'a.pdf' })
    const b = make({ id: 'b', name: 'b.pdf' })
    const ranked = rankFiles([a, b], { keyword: '', tagNamesById: new Map() })
    expect(ranked.map((r) => r.id)).toEqual(['a', 'b'])
  })

  it('drops rows that match nothing', () => {
    const miss = make({ id: 'miss', name: 'unrelated.pdf' })
    const ranked = rankFiles([miss], {
      keyword: 'foo',
      tagNamesById: new Map()
    })
    expect(ranked).toHaveLength(0)
  })
})
