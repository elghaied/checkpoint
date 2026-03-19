import { describe, it, expect } from 'vitest'
import { applyFilters, countActiveFilters, type FilterCriteria } from './filterEngine'
import type { TrackedItem } from './types'

function makeItem(
  id: string,
  opts: { format: 'MANGA' | 'MANHWA' | 'MANHUA'; genres: string[]; tags: string[] }
): TrackedItem {
  return {
    provider: 'anilist',
    providerId: id,
    mediaType: 'manga',
    format: opts.format,
    titles: { main: `Title ${id}`, alt: [] },
    coverImage: '',
    progress: { unit: 'chapter', value: '0' },
    lastUrl: '',
    updatedAt: 0,
    createdAt: 0,
    chaptersWhenAdded: null,
    latestKnownChapters: null,
    lastApiCheck: null,
    notificationsEnabled: false,
    anilistStatus: null,
    genres: opts.genres,
    tags: opts.tags,
    genresBackfilled: false,
  }
}

const items = [
  makeItem('1', { format: 'MANHWA', genres: ['Action', 'Romance'], tags: ['S-tier'] }),
  makeItem('2', { format: 'MANGA', genres: ['Action', 'Horror'], tags: ['comfort'] }),
  makeItem('3', { format: 'MANHWA', genres: ['Romance', 'Fantasy'], tags: ['S-tier', 'comfort'] }),
  makeItem('4', { format: 'MANHUA', genres: ['Action'], tags: [] }),
]

const emptyCriteria: FilterCriteria = { formats: [], genres: [], tags: [] }

describe('applyFilters', () => {
  it('returns all items when no filters are active', () => {
    expect(applyFilters(items, emptyCriteria)).toEqual(items)
  })

  it('filters by format using OR logic', () => {
    const criteria: FilterCriteria = { formats: ['MANHWA', 'MANHUA'], genres: [], tags: [] }
    const result = applyFilters(items, criteria)
    expect(result.map(i => i.providerId)).toEqual(['1', '3', '4'])
  })

  it('filters by genre AND', () => {
    // Must have Action AND Romance
    const criteria: FilterCriteria = {
      formats: [],
      genres: [
        { value: 'Action', mode: 'and' },
        { value: 'Romance', mode: 'and' },
      ],
      tags: [],
    }
    const result = applyFilters(items, criteria)
    // Only item 1 has both Action and Romance
    expect(result.map(i => i.providerId)).toEqual(['1'])
  })

  it('filters by genre OR', () => {
    // Must have Romance OR Fantasy
    const criteria: FilterCriteria = {
      formats: [],
      genres: [
        { value: 'Romance', mode: 'or' },
        { value: 'Fantasy', mode: 'or' },
      ],
      tags: [],
    }
    const result = applyFilters(items, criteria)
    // Items 1 (Romance), 3 (Romance + Fantasy) match
    expect(result.map(i => i.providerId)).toEqual(['1', '3'])
  })

  it('filters by genre Exclude', () => {
    // Must NOT have Horror
    const criteria: FilterCriteria = {
      formats: [],
      genres: [{ value: 'Horror', mode: 'exclude' }],
      tags: [],
    }
    const result = applyFilters(items, criteria)
    // Item 2 has Horror, so exclude it
    expect(result.map(i => i.providerId)).toEqual(['1', '3', '4'])
  })

  it('combines AND + OR + Exclude in genres', () => {
    // Must have Action AND (Romance OR Fantasy) AND NOT Horror
    const criteria: FilterCriteria = {
      formats: [],
      genres: [
        { value: 'Action', mode: 'and' },
        { value: 'Romance', mode: 'or' },
        { value: 'Fantasy', mode: 'or' },
        { value: 'Horror', mode: 'exclude' },
      ],
      tags: [],
    }
    const result = applyFilters(items, criteria)
    // Item 1: Action ✓, Romance ✓ (or satisfied), no Horror ✓ → match
    // Item 2: Action ✓, no Romance/Fantasy ✗ (or not satisfied) → no match
    // Item 3: no Action ✗ (and not satisfied) → no match
    // Item 4: Action ✓, no Romance/Fantasy ✗ (or not satisfied) → no match
    expect(result.map(i => i.providerId)).toEqual(['1'])
  })

  it('combines format + genre + tag filters (AND across categories)', () => {
    // MANHWA format + Action genre (and) + S-tier tag (and)
    const criteria: FilterCriteria = {
      formats: ['MANHWA'],
      genres: [{ value: 'Action', mode: 'and' }],
      tags: [{ value: 'S-tier', mode: 'and' }],
    }
    const result = applyFilters(items, criteria)
    // Item 1: MANHWA ✓, Action ✓, S-tier ✓ → match
    // Item 3: MANHWA ✓, no Action ✗ → no match
    expect(result.map(i => i.providerId)).toEqual(['1'])
  })

  it('tag exclude works', () => {
    // Exclude items with comfort tag
    const criteria: FilterCriteria = {
      formats: [],
      genres: [],
      tags: [{ value: 'comfort', mode: 'exclude' }],
    }
    const result = applyFilters(items, criteria)
    // Items 2 and 3 have comfort tag
    expect(result.map(i => i.providerId)).toEqual(['1', '4'])
  })
})

describe('countActiveFilters', () => {
  it('returns 0 when no filters are active', () => {
    expect(countActiveFilters(emptyCriteria)).toBe(0)
  })

  it('counts format filters', () => {
    const criteria: FilterCriteria = { formats: ['MANGA', 'MANHWA'], genres: [], tags: [] }
    expect(countActiveFilters(criteria)).toBe(2)
  })

  it('counts genre and tag filter entries', () => {
    const criteria: FilterCriteria = {
      formats: ['MANHWA'],
      genres: [{ value: 'Action', mode: 'and' }, { value: 'Horror', mode: 'exclude' }],
      tags: [{ value: 'S-tier', mode: 'or' }],
    }
    expect(countActiveFilters(criteria)).toBe(4)
  })
})
