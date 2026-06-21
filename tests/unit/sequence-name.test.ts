import { describe, it, expect } from 'vitest'
import { nextSequenceName } from '@main/repo/sequence-name'

describe('nextSequenceName', () => {
  it('appends (2) on first collision', () => {
    expect(nextSequenceName('a.pdf', new Set(['a.pdf']))).toBe('a (2).pdf')
  })

  it('skips taken (n) and lands on next free', () => {
    expect(
      nextSequenceName('a.pdf', new Set(['a.pdf', 'a (2).pdf', 'a (3).pdf']))
    ).toBe('a (4).pdf')
  })

  it('handles file with no extension', () => {
    expect(nextSequenceName('README', new Set(['README']))).toBe('README (2)')
  })

  it('handles multi-dot filenames (extension = last segment)', () => {
    expect(nextSequenceName('a.tar.gz', new Set(['a.tar.gz']))).toBe(
      'a.tar (2).gz'
    )
  })

  it('is case-insensitive when checking taken set', () => {
    expect(nextSequenceName('A.pdf', new Set(['a.pdf']))).toBe('A (2).pdf')
  })

  it('returns input unchanged if not taken', () => {
    expect(nextSequenceName('a.pdf', new Set())).toBe('a.pdf')
  })
})
