import { describe, it, expect } from 'vitest'
import {
  classifyMatchTier,
  detectDuplicates,
  buildPendingReviewList,
  generateDiagnosticCsv,
  collectNewTags,
} from './confirmLogic'
import type { ImportRow } from '@/shared/importTypes'
import type { TrackedItem, CustomTagRegistry } from '@/shared/types'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeRow(overrides: Partial<ImportRow> = {}): ImportRow {
  return {
    index: 0,
    csvTitle: 'Test Title',
    csvChapter: null,
    csvUrl: null,
    csvTags: [],
    matchStatus: 'pending',
    matchTier: null,
    bestMatch: null,
    alternatives: [],
    confidenceScore: null,
    duplicateOf: null,
    duplicateConflict: null,
    userSelection: null,
    userSkipped: false,
    ...overrides,
  }
}

function makeTrackedItem(overrides: Partial<TrackedItem> = {}): TrackedItem {
  return {
    provider: 'anilist',
    providerId: 'test-id',
    mediaType: 'manga',
    format: 'MANGA',
    titles: { main: 'Test', alt: [] },
    coverImage: '',
    progress: { unit: 'chapter', value: '0' },
    lastUrl: '',
    updatedAt: Date.now(),
    createdAt: Date.now(),
    chaptersWhenAdded: null,
    latestKnownChapters: null,
    lastApiCheck: null,
    notificationsEnabled: true,
    anilistStatus: null,
    genres: [],
    tags: [],
    genresBackfilled: false,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// classifyMatchTier
// ---------------------------------------------------------------------------

describe('classifyMatchTier', () => {
  it('returns green for score >= 0.85', () => {
    expect(classifyMatchTier(0.85)).toBe('green')
    expect(classifyMatchTier(1.0)).toBe('green')
    expect(classifyMatchTier(0.99)).toBe('green')
  })

  it('returns yellow for score 0.50 to 0.84', () => {
    expect(classifyMatchTier(0.50)).toBe('yellow')
    expect(classifyMatchTier(0.70)).toBe('yellow')
    expect(classifyMatchTier(0.84)).toBe('yellow')
  })

  it('returns red for score < 0.50', () => {
    expect(classifyMatchTier(0.0)).toBe('red')
    expect(classifyMatchTier(0.49)).toBe('red')
    expect(classifyMatchTier(0.1)).toBe('red')
  })

  it('returns red for null score', () => {
    expect(classifyMatchTier(null)).toBe('red')
  })
})

// ---------------------------------------------------------------------------
// detectDuplicates
// ---------------------------------------------------------------------------

describe('detectDuplicates', () => {
  const makeMatch = (id: string, title = 'Some Title') => ({
    provider: 'anilist' as const,
    id,
    title: { primary: title, alt: [] },
    coverUrl: '',
    format: 'MANGA' as const,
    status: null,
    chapters: null,
    genres: [],
    confidence: 0.9,
    originalData: {} as never,
  })

  it('does not modify rows with no match', () => {
    const row = makeRow({ csvTitle: 'No Match' })
    const result = detectDuplicates([row], [])
    expect(result[0].duplicateOf).toBeNull()
  })

  it('does not modify rows when no existing item matches providerId', () => {
    const match = makeMatch('anilist-99')
    const row = makeRow({ bestMatch: match })
    const existing = makeTrackedItem({ providerId: 'anilist-other' })
    const result = detectDuplicates([row], [existing])
    expect(result[0].duplicateOf).toBeNull()
  })

  it('marks duplicateOf when existing item has same providerId', () => {
    const match = makeMatch('anilist-42')
    const row = makeRow({ bestMatch: match, csvChapter: '10' })
    const existing = makeTrackedItem({ providerId: 'anilist-42', progress: { unit: 'chapter', value: '5' } })
    const result = detectDuplicates([row], [existing])
    expect(result[0].duplicateOf).toBe('anilist-42')
  })

  it('sets userSkipped when import chapter <= existing chapter', () => {
    const match = makeMatch('anilist-42')
    const row = makeRow({ bestMatch: match, csvChapter: '5' })
    const existing = makeTrackedItem({ providerId: 'anilist-42', progress: { unit: 'chapter', value: '5' } })
    const result = detectDuplicates([row], [existing])
    expect(result[0].userSkipped).toBe(true)
  })

  it('sets userSkipped when import chapter is lower than existing', () => {
    const match = makeMatch('anilist-42')
    const row = makeRow({ bestMatch: match, csvChapter: '3' })
    const existing = makeTrackedItem({ providerId: 'anilist-42', progress: { unit: 'chapter', value: '5' } })
    const result = detectDuplicates([row], [existing])
    expect(result[0].userSkipped).toBe(true)
  })

  it('flags higher_chapter_no_url conflict when import chapter > existing and no url', () => {
    const match = makeMatch('anilist-42')
    const row = makeRow({ bestMatch: match, csvChapter: '20', csvUrl: null })
    const existing = makeTrackedItem({ providerId: 'anilist-42', progress: { unit: 'chapter', value: '5' } })
    const result = detectDuplicates([row], [existing])
    expect(result[0].duplicateConflict).toEqual({ type: 'higher_chapter_no_url' })
    expect(result[0].userSkipped).toBe(false)
  })

  it('flags different_site conflict when import url host differs from existing url host', () => {
    const match = makeMatch('anilist-42')
    const row = makeRow({ bestMatch: match, csvChapter: '20', csvUrl: 'https://site-b.com/manga/1' })
    const existing = makeTrackedItem({
      providerId: 'anilist-42',
      progress: { unit: 'chapter', value: '5' },
      lastUrl: 'https://site-a.com/manga/1',
    })
    const result = detectDuplicates([row], [existing])
    expect(result[0].duplicateConflict).toEqual({
      type: 'different_site',
      existingUrl: 'https://site-a.com/manga/1',
      importUrl: 'https://site-b.com/manga/1',
    })
  })

  it('does not flag different_site when hosts match', () => {
    const match = makeMatch('anilist-42')
    const row = makeRow({ bestMatch: match, csvChapter: '20', csvUrl: 'https://site-a.com/manga/2' })
    const existing = makeTrackedItem({
      providerId: 'anilist-42',
      progress: { unit: 'chapter', value: '5' },
      lastUrl: 'https://site-a.com/manga/1',
    })
    const result = detectDuplicates([row], [existing])
    expect(result[0].duplicateConflict).toBeNull()
    expect(result[0].duplicateOf).toBe('anilist-42')
  })

  it('prefers userSelection over bestMatch for duplicate detection', () => {
    const matchA = makeMatch('anilist-10', 'Title A')
    const matchB = makeMatch('anilist-42', 'Title B')
    const row = makeRow({ bestMatch: matchA, userSelection: matchB, csvChapter: '10' })
    const existing = makeTrackedItem({ providerId: 'anilist-42', progress: { unit: 'chapter', value: '5' } })
    const result = detectDuplicates([row], [existing])
    expect(result[0].duplicateOf).toBe('anilist-42')
  })
})

// ---------------------------------------------------------------------------
// buildPendingReviewList
// ---------------------------------------------------------------------------

describe('buildPendingReviewList', () => {
  it('includes yellow rows not in importedTiers', () => {
    const row = makeRow({ matchTier: 'yellow', csvTitle: 'Uncertain Match' })
    const result = buildPendingReviewList([row], new Set())
    expect(result.items).toHaveLength(1)
    expect(result.items[0].csvTitle).toBe('Uncertain Match')
    expect(result.items[0].tier).toBe('yellow')
  })

  it('includes red rows not in importedTiers', () => {
    const row = makeRow({ matchTier: 'red', csvTitle: 'No Match Found' })
    const result = buildPendingReviewList([row], new Set())
    expect(result.items).toHaveLength(1)
    expect(result.items[0].tier).toBe('red')
  })

  it('excludes rows with tier in importedTiers', () => {
    const row = makeRow({ matchTier: 'yellow' })
    const result = buildPendingReviewList([row], new Set(['yellow']))
    expect(result.items).toHaveLength(0)
  })

  it('excludes skipped rows', () => {
    const row = makeRow({ matchTier: 'yellow', userSkipped: true })
    const result = buildPendingReviewList([row], new Set())
    expect(result.items).toHaveLength(0)
  })

  it('excludes green rows', () => {
    const row = makeRow({ matchTier: 'green' })
    const result = buildPendingReviewList([row], new Set())
    expect(result.items).toHaveLength(0)
  })

  it('excludes rows with null matchTier', () => {
    const row = makeRow({ matchTier: null })
    const result = buildPendingReviewList([row], new Set())
    expect(result.items).toHaveLength(0)
  })

  it('returns empty items when all tiers imported', () => {
    const rows = [
      makeRow({ matchTier: 'yellow' }),
      makeRow({ matchTier: 'red' }),
    ]
    const result = buildPendingReviewList(rows, new Set(['yellow', 'red']))
    expect(result.items).toHaveLength(0)
  })

  it('maps bestMatch or userSelection onto items', () => {
    const match = {
      provider: 'anilist' as const,
      id: 'x',
      title: { primary: 'Match Title', alt: [] },
      coverUrl: '',
      format: 'MANGA' as const,
      status: null,
      chapters: null,
      genres: [],
      confidence: 0.7,
      originalData: {} as never,
    }
    const row = makeRow({ matchTier: 'yellow', bestMatch: match })
    const result = buildPendingReviewList([row], new Set())
    expect(result.items[0].bestMatch?.title.primary).toBe('Match Title')
  })

  it('includes createdAt and lastActivityAt timestamps', () => {
    const before = Date.now()
    const result = buildPendingReviewList([], new Set())
    const after = Date.now()
    expect(result.createdAt).toBeGreaterThanOrEqual(before)
    expect(result.createdAt).toBeLessThanOrEqual(after)
    expect(result.lastActivityAt).toBeGreaterThanOrEqual(before)
  })
})

// ---------------------------------------------------------------------------
// generateDiagnosticCsv
// ---------------------------------------------------------------------------

describe('generateDiagnosticCsv', () => {
  it('produces a header row followed by data rows', () => {
    const rows = [makeRow({ csvTitle: 'My Manga', csvChapter: '5', matchTier: 'yellow' })]
    const csv = generateDiagnosticCsv(rows)
    const lines = csv.split('\n')
    expect(lines[0]).toBe('title,ch,url,tags,status,best_match,confidence')
    expect(lines).toHaveLength(2)
  })

  it('maps yellow tier to possible_match status', () => {
    const row = makeRow({ csvTitle: 'Test', matchTier: 'yellow' })
    const csv = generateDiagnosticCsv([row])
    expect(csv).toContain('possible_match')
  })

  it('maps red tier to no_match status', () => {
    const row = makeRow({ csvTitle: 'Test', matchTier: 'red' })
    const csv = generateDiagnosticCsv([row])
    expect(csv).toContain('no_match')
  })

  it('maps null tier to no_match status', () => {
    const row = makeRow({ csvTitle: 'Test', matchTier: null })
    const csv = generateDiagnosticCsv([row])
    expect(csv).toContain('no_match')
  })

  it('outputs conflict status when duplicateConflict is set', () => {
    const row = makeRow({
      csvTitle: 'Test',
      matchTier: 'green',
      duplicateConflict: { type: 'higher_chapter_no_url' },
    })
    const csv = generateDiagnosticCsv([row])
    expect(csv).toContain('conflict')
  })

  it('escapes titles with commas', () => {
    const row = makeRow({ csvTitle: 'Title, With Comma' })
    const csv = generateDiagnosticCsv([row])
    expect(csv).toContain('"Title, With Comma"')
  })

  it('escapes titles with double quotes', () => {
    const row = makeRow({ csvTitle: 'Title "With" Quotes' })
    const csv = generateDiagnosticCsv([row])
    expect(csv).toContain('"Title ""With"" Quotes"')
  })

  it('includes confidence score when set', () => {
    const row = makeRow({ csvTitle: 'Test', confidenceScore: 0.75 })
    const csv = generateDiagnosticCsv([row])
    expect(csv).toContain('0.75')
  })

  it('leaves confidence empty when null', () => {
    const row = makeRow({ csvTitle: 'Test', confidenceScore: null })
    const csv = generateDiagnosticCsv([row])
    const dataLine = csv.split('\n')[1]
    // Last field should be empty
    expect(dataLine.endsWith(',')).toBe(true)
  })

  it('includes best match title when present', () => {
    const match = {
      provider: 'anilist' as const,
      id: 'x',
      title: { primary: 'The Match', alt: [] },
      coverUrl: '',
      format: 'MANGA' as const,
      status: null,
      chapters: null,
      genres: [],
      confidence: 0.9,
      originalData: {} as never,
    }
    const row = makeRow({ csvTitle: 'Test', bestMatch: match })
    const csv = generateDiagnosticCsv([row])
    expect(csv).toContain('The Match')
  })

  it('joins csvTags with comma-space', () => {
    const row = makeRow({ csvTitle: 'Test', csvTags: ['action', 'romance'] })
    const csv = generateDiagnosticCsv([row])
    expect(csv).toContain('"action, romance"')
  })

  it('produces only header for empty rows array', () => {
    const csv = generateDiagnosticCsv([])
    expect(csv).toBe('title,ch,url,tags,status,best_match,confidence')
  })
})

// ---------------------------------------------------------------------------
// collectNewTags
// ---------------------------------------------------------------------------

describe('collectNewTags', () => {
  it('returns empty array when no rows have tags', () => {
    const result = collectNewTags([makeRow()], {})
    expect(result).toEqual([])
  })

  it('returns tags that are not in the registry', () => {
    const row = makeRow({ csvTags: ['Action', 'Romance'] })
    const result = collectNewTags([row], {})
    expect(result).toContain('Action')
    expect(result).toContain('Romance')
    expect(result).toHaveLength(2)
  })

  it('excludes tags already in the registry (exact match)', () => {
    const row = makeRow({ csvTags: ['Action', 'Romance'] })
    const registry: CustomTagRegistry = { Action: { color: '#ff0000' } }
    const result = collectNewTags([row], registry)
    expect(result).not.toContain('Action')
    expect(result).toContain('Romance')
  })

  it('excludes tags already in the registry (case-insensitive)', () => {
    const row = makeRow({ csvTags: ['action', 'ROMANCE'] })
    const registry: CustomTagRegistry = { Action: { color: '#ff0000' }, romance: { color: '#00ff00' } }
    const result = collectNewTags([row], registry)
    expect(result).toHaveLength(0)
  })

  it('deduplicates tags across multiple rows', () => {
    const rows = [
      makeRow({ csvTags: ['Action'] }),
      makeRow({ csvTags: ['action', 'Drama'] }),
    ]
    const result = collectNewTags(rows, {})
    // 'Action' appears once, 'action' is duplicate of Action (case-insensitive), 'Drama' is new
    const lower = result.map((t) => t.toLowerCase())
    expect(lower.filter((t) => t === 'action')).toHaveLength(1)
    expect(lower).toContain('drama')
  })

  it('preserves original casing of first occurrence', () => {
    const rows = [
      makeRow({ csvTags: ['Action'] }),
      makeRow({ csvTags: ['ACTION'] }),
    ]
    const result = collectNewTags(rows, {})
    // First occurrence wins
    expect(result).toContain('Action')
    expect(result).not.toContain('ACTION')
  })

  it('returns empty array when all tags exist in registry', () => {
    const row = makeRow({ csvTags: ['comedy', 'drama'] })
    const registry: CustomTagRegistry = {
      Comedy: { color: '#aaa' },
      Drama: { color: '#bbb' },
    }
    const result = collectNewTags([row], registry)
    expect(result).toHaveLength(0)
  })
})
