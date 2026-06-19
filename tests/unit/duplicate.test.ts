import { describe, it, expect } from 'vitest'
import { findDuplicateByName } from '@main/repo/duplicate'
import type { FileInfo } from '@shared/types'

const make = (name: string): FileInfo => ({
  id: name,
  name,
  ext: name.split('.').pop()!.toLowerCase(),
  size: 1,
  storagePath: `files/${name}/${name}`,
  note: '',
  importedAt: 't',
  updatedAt: 't'
})

describe('findDuplicateByName', () => {
  const existing = [make('Report.pdf'), make('photo.jpg')]

  it('matches case-insensitively', () => {
    expect(findDuplicateByName('report.pdf', existing)?.id).toBe('Report.pdf')
    expect(findDuplicateByName('REPORT.PDF', existing)?.id).toBe('Report.pdf')
  })

  it('returns null when not found', () => {
    expect(findDuplicateByName('other.pdf', existing)).toBeNull()
  })

  it('matches exact characters except case (no fuzzy)', () => {
    expect(findDuplicateByName('Report (1).pdf', existing)).toBeNull()
  })
})
