import { describe, it, expect } from 'vitest'
import { deriveEscAction } from '@renderer/lib/derive-esc-action'

describe('deriveEscAction', () => {
  it('returns close-drawer when selectedId is set (highest priority)', () => {
    expect(
      deriveEscAction({
        selectedId: 'a',
        keyword: 'foo',
        hasFilter: true
      })
    ).toBe('close-drawer')
  })

  it('returns clear-keyword when no selection but keyword non-empty', () => {
    expect(
      deriveEscAction({
        selectedId: null,
        keyword: 'foo',
        hasFilter: true
      })
    ).toBe('clear-keyword')
  })

  it('returns reset-filter when no selection no keyword but filter active', () => {
    expect(
      deriveEscAction({
        selectedId: null,
        keyword: '',
        hasFilter: true
      })
    ).toBe('reset-filter')
  })

  it('returns null when nothing to do', () => {
    expect(
      deriveEscAction({
        selectedId: null,
        keyword: '',
        hasFilter: false
      })
    ).toBeNull()
  })
})
