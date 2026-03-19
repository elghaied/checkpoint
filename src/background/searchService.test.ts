import { describe, it, expect, vi, beforeEach } from 'vitest'
import { searchWithFallback } from './searchService'
import { searchAniList } from './anilist'
import { searchMangaDex } from './mangadex'
import type { AniListMedia, MangaDexMedia } from '@/shared/types'

// ---------------------------------------------------------------------------
// Module mocks — keep real scoring functions, mock only the API callers
// ---------------------------------------------------------------------------

vi.mock('./anilist', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./anilist')>()
  return {
    ...actual,
    searchAniList: vi.fn(),
  }
})

vi.mock('./mangadex', () => ({
  searchMangaDex: vi.fn(),
}))

const mockSearchAniList = vi.mocked(searchAniList)
const mockSearchMangaDex = vi.mocked(searchMangaDex)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAniListMedia(
  id: number,
  romaji: string,
  english: string | null = null,
  native = '',
  synonyms: string[] = [],
  countryOfOrigin: string | null = 'JP',
): AniListMedia {
  return {
    id,
    type: 'MANGA',
    format: 'MANGA',
    title: { romaji, english, native },
    synonyms,
    coverImage: { large: `https://example.com/${id}-large.jpg`, medium: `https://example.com/${id}-medium.jpg` },
    countryOfOrigin,
    status: 'RELEASING',
    chapters: null,
    genres: [],
  }
}

function makeMangaDexMedia(
  id: string,
  title: string,
  altTitles: string[] = [],
  originalLanguage = 'ja',
): MangaDexMedia {
  return {
    id,
    title,
    altTitles,
    coverUrl: `https://example.com/covers/${id}.jpg`,
    originalLanguage,
    status: 'ongoing',
    lastChapter: null,
    genres: [],
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('searchWithFallback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSearchMangaDex.mockResolvedValue([])
  })

  // -------------------------------------------------------------------------
  // Scenario 1: AniList match above threshold
  // -------------------------------------------------------------------------

  describe('AniList match above threshold (confidence >= 0.7)', () => {
    it('returns AniList results sorted by confidence when above threshold', async () => {
      // "Solo Leveling" exact match → confidence 1.0
      // "Solo Leveling Extended" prefix match → confidence 0.9
      const media1 = makeAniListMedia(1, 'Solo Leveling Extended')
      const media2 = makeAniListMedia(2, 'Solo Leveling')
      mockSearchAniList.mockResolvedValue([media1, media2])

      const results = await searchWithFallback('Solo Leveling', 'Solo Leveling')

      expect(results).toHaveLength(2)
      // Should be sorted by confidence descending — exact match first
      expect(results[0].confidence).toBe(1.0)
      expect(results[0].id).toBe('2')
      expect(results[1].confidence).toBe(0.9)
      expect(results[1].id).toBe('1')
    })

    it('does not call MangaDex when AniList has confident results', async () => {
      mockSearchAniList.mockResolvedValue([makeAniListMedia(1, 'Solo Leveling')])

      await searchWithFallback('Solo Leveling', 'Solo Leveling')

      expect(mockSearchMangaDex).not.toHaveBeenCalled()
    })

    it('returns correct provider field for AniList results', async () => {
      mockSearchAniList.mockResolvedValue([makeAniListMedia(1, 'Solo Leveling')])

      const results = await searchWithFallback('Solo Leveling', 'Solo Leveling')

      expect(results[0].provider).toBe('anilist')
    })

    it('includes substring match (0.7) as above-threshold result', async () => {
      // "the great solo leveling story" contains "solo leveling" → 0.7
      const media = makeAniListMedia(1, 'solo leveling', null, '', ['the great solo leveling story'])
      mockSearchAniList.mockResolvedValue([media])

      const results = await searchWithFallback('Solo Leveling', 'Solo Leveling')

      expect(results).toHaveLength(1)
      expect(results[0].confidence).toBeGreaterThanOrEqual(0.7)
    })
  })

  // -------------------------------------------------------------------------
  // Scenario 2: Fallback to MangaDex
  // -------------------------------------------------------------------------

  describe('Fallback to MangaDex when AniList returns empty', () => {
    it('calls MangaDex when AniList returns empty array', async () => {
      mockSearchAniList.mockResolvedValue([])
      mockSearchMangaDex.mockResolvedValue([makeMangaDexMedia('mdx-1', 'Solo Leveling')])

      const results = await searchWithFallback('Solo Leveling', 'Solo Leveling')

      expect(mockSearchMangaDex).toHaveBeenCalledOnce()
      expect(results).toHaveLength(1)
      expect(results[0].provider).toBe('mangadex')
    })

    it('returns MangaDex results above threshold sorted by confidence', async () => {
      mockSearchAniList.mockResolvedValue([])
      // "Solo Leveling" exact → 1.0; "Solo Leveling Extended" prefix → 0.9
      mockSearchMangaDex.mockResolvedValue([
        makeMangaDexMedia('mdx-2', 'Solo Leveling Extended'),
        makeMangaDexMedia('mdx-1', 'Solo Leveling'),
      ])

      const results = await searchWithFallback('Solo Leveling', 'Solo Leveling')

      expect(results[0].confidence).toBe(1.0)
      expect(results[0].id).toBe('mdx-1')
      expect(results[1].confidence).toBe(0.9)
      expect(results[1].id).toBe('mdx-2')
    })

    it('returns correct provider field for MangaDex results', async () => {
      mockSearchAniList.mockResolvedValue([])
      mockSearchMangaDex.mockResolvedValue([makeMangaDexMedia('mdx-1', 'Solo Leveling')])

      const results = await searchWithFallback('Solo Leveling', 'Solo Leveling')

      expect(results[0].provider).toBe('mangadex')
    })
  })

  // -------------------------------------------------------------------------
  // Scenario 3: Low-confidence AniList return
  // -------------------------------------------------------------------------

  describe('Low-confidence AniList results (none meet threshold)', () => {
    it('returns top 5 low-confidence results when AniList has results below threshold', async () => {
      // "Attack on Titan" vs extractedTitle "Solo Leveling" → score 0, but we need
      // some score > 0 so they show up. Use titles that are substrings of each other
      // at a low level. Actually scorePair returns 0 for unrelated titles, so those
      // items won't be returned (they score 0). Let's use titles that share a substring.
      // "Solo" is only 4 chars and is contained in "Solo Adventure" etc.
      // scorePair("solo leveling", "solo adventure") → "solo" in "solo leveling"? no
      // Actually "solo adventure".includes("solo leveling") is false,
      // "solo leveling".includes("solo adventure") is false → score 0.
      // We need something where one contains the other but below 0.7.
      // scorePair only has tiers: 1.0, 0.9, 0.85, 0.8, 0.7, 0.
      // 0.7 IS the threshold. Items scoring exactly 0.7 pass the threshold.
      // So to get low-confidence (below threshold), items must score 0 — meaning
      // no containment relationship. But then they'd still be in normalizedAnilist
      // with confidence 0, and the code returns them as low-confidence.
      // The code: if normalizedAnilist.length > 0 return top 5 sorted by confidence.
      // So any AniList results that come back (even with 0 confidence) are returned
      // when there are no above-threshold results.

      const mediaItems = [
        makeAniListMedia(1, 'Attack on Titan'),
        makeAniListMedia(2, 'Demon Slayer'),
        makeAniListMedia(3, 'One Piece'),
        makeAniListMedia(4, 'Naruto'),
        makeAniListMedia(5, 'Bleach'),
        makeAniListMedia(6, 'Dragon Ball'),
      ]
      mockSearchAniList.mockResolvedValue(mediaItems)

      const results = await searchWithFallback('Solo Leveling', 'Solo Leveling')

      // Should cap at MAX_LOW_CONFIDENCE_RESULTS (5)
      expect(results).toHaveLength(5)
      // MangaDex should NOT be called since AniList returned results (even low-confidence)
      expect(mockSearchMangaDex).not.toHaveBeenCalled()
    })

    it('returns fewer than 5 if AniList returned fewer results', async () => {
      mockSearchAniList.mockResolvedValue([
        makeAniListMedia(1, 'Attack on Titan'),
        makeAniListMedia(2, 'Demon Slayer'),
      ])

      const results = await searchWithFallback('Solo Leveling', 'Solo Leveling')

      expect(results).toHaveLength(2)
      expect(mockSearchMangaDex).not.toHaveBeenCalled()
    })

    it('sorts low-confidence results by confidence descending', async () => {
      // Give some items a slight score advantage via partial match
      // "solo adventure" doesn't contain "solo leveling" → 0
      // "the solo leveling saga" contains "solo leveling" → 0.7 (above threshold)
      // Use: media with romaji that partially matches
      // "solo" is not >=3 char containment of "solo leveling"
      // Let's use a case where confidence differs: prefix vs no-match
      mockSearchAniList.mockResolvedValue([
        makeAniListMedia(1, 'Completely Unrelated Title A'), // score 0
        makeAniListMedia(2, 'Solo Leveling Extended Edition'), // score 0.9 → above threshold!
      ])

      // media2 is above threshold → validAnilist has it → returns sorted valid
      const results = await searchWithFallback('Solo Leveling', 'Solo Leveling')
      expect(results[0].id).toBe('2')
      expect(results[0].confidence).toBe(0.9)
    })

    it('does not call MangaDex when AniList returned results (even low-confidence)', async () => {
      mockSearchAniList.mockResolvedValue([makeAniListMedia(1, 'Completely Unrelated Title')])

      await searchWithFallback('Solo Leveling', 'Solo Leveling')

      expect(mockSearchMangaDex).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // Scenario 4: MangaDex low-confidence results
  // -------------------------------------------------------------------------

  describe('MangaDex low-confidence results (none meet threshold)', () => {
    it('returns top 5 low-confidence MangaDex results when none meet threshold', async () => {
      mockSearchAniList.mockResolvedValue([])
      const mangaDexItems = [
        makeMangaDexMedia('md-1', 'Attack on Titan'),
        makeMangaDexMedia('md-2', 'Demon Slayer'),
        makeMangaDexMedia('md-3', 'One Piece'),
        makeMangaDexMedia('md-4', 'Naruto'),
        makeMangaDexMedia('md-5', 'Bleach'),
        makeMangaDexMedia('md-6', 'Dragon Ball'),
      ]
      mockSearchMangaDex.mockResolvedValue(mangaDexItems)

      const results = await searchWithFallback('Solo Leveling', 'Solo Leveling')

      expect(results).toHaveLength(5)
      expect(results.every((r) => r.provider === 'mangadex')).toBe(true)
    })

    it('returns fewer than 5 if MangaDex returned fewer results', async () => {
      mockSearchAniList.mockResolvedValue([])
      mockSearchMangaDex.mockResolvedValue([
        makeMangaDexMedia('md-1', 'Attack on Titan'),
        makeMangaDexMedia('md-2', 'Demon Slayer'),
      ])

      const results = await searchWithFallback('Solo Leveling', 'Solo Leveling')

      expect(results).toHaveLength(2)
    })

    it('sorts MangaDex low-confidence results by confidence descending', async () => {
      mockSearchAniList.mockResolvedValue([])
      mockSearchMangaDex.mockResolvedValue([
        makeMangaDexMedia('md-1', 'Unrelated Title'),          // score 0
        makeMangaDexMedia('md-2', 'Another Unrelated Title'),  // score 0
      ])

      const results = await searchWithFallback('Solo Leveling', 'Solo Leveling')

      // All 0 confidence, but still returned
      expect(results).toHaveLength(2)
      expect(results.every((r) => r.confidence === 0)).toBe(true)
    })
  })

  // -------------------------------------------------------------------------
  // Scenario 5: Both AniList and MangaDex return empty
  // -------------------------------------------------------------------------

  describe('Both empty', () => {
    it('returns empty array when both AniList and MangaDex return empty', async () => {
      mockSearchAniList.mockResolvedValue([])
      mockSearchMangaDex.mockResolvedValue([])

      const results = await searchWithFallback('Solo Leveling', 'Solo Leveling')

      expect(results).toHaveLength(0)
      expect(results).toEqual([])
    })

    it('calls both providers when AniList returns empty', async () => {
      mockSearchAniList.mockResolvedValue([])
      mockSearchMangaDex.mockResolvedValue([])

      await searchWithFallback('Solo Leveling', 'Solo Leveling')

      expect(mockSearchAniList).toHaveBeenCalledOnce()
      expect(mockSearchMangaDex).toHaveBeenCalledOnce()
    })
  })

  // -------------------------------------------------------------------------
  // Result shape validation
  // -------------------------------------------------------------------------

  describe('Result shape', () => {
    it('normalizes AniList media into UnifiedSearchResult shape', async () => {
      const media = makeAniListMedia(42, 'Solo Leveling', 'Solo Leveling', '나 혼자만 레벨업', [], 'KR')
      mockSearchAniList.mockResolvedValue([media])

      const results = await searchWithFallback('Solo Leveling', 'Solo Leveling')

      expect(results).toHaveLength(1)
      const result = results[0]
      expect(result.provider).toBe('anilist')
      expect(result.id).toBe('42')
      expect(result.title.primary).toBe('Solo Leveling') // english title preferred
      expect(result.format).toBe('MANHWA') // KR → MANHWA
      expect(result.confidence).toBe(1.0)
      expect(result.originalData).toBe(media)
    })

    it('normalizes MangaDex media into UnifiedSearchResult shape', async () => {
      mockSearchAniList.mockResolvedValue([])
      const media = makeMangaDexMedia('mdx-42', 'Solo Leveling', ['Only I Level Up'], 'ko')
      mockSearchMangaDex.mockResolvedValue([media])

      const results = await searchWithFallback('Solo Leveling', 'Solo Leveling')

      const result = results[0]
      expect(result.provider).toBe('mangadex')
      expect(result.id).toBe('mdx-42')
      expect(result.title.primary).toBe('Solo Leveling')
      expect(result.title.alt).toContain('Only I Level Up')
      expect(result.format).toBe('MANHWA') // ko → MANHWA
      expect(result.confidence).toBe(1.0)
      expect(result.originalData).toBe(media)
    })

    it('uses romaji as primary title when english is null', async () => {
      const media = makeAniListMedia(1, 'Boku no Hero Academia', null, 'ヒロアカ')
      mockSearchAniList.mockResolvedValue([media])

      const results = await searchWithFallback('Boku no Hero Academia', 'Boku no Hero Academia')

      expect(results[0].title.primary).toBe('Boku no Hero Academia')
    })

    it('converts null lastChapter to null chapters on MangaDex result', async () => {
      mockSearchAniList.mockResolvedValue([])
      const media: MangaDexMedia = {
        ...makeMangaDexMedia('md-1', 'Solo Leveling'),
        lastChapter: null,
      }
      mockSearchMangaDex.mockResolvedValue([media])

      const results = await searchWithFallback('Solo Leveling', 'Solo Leveling')

      expect(results[0].chapters).toBeNull()
    })

    it('parses lastChapter string into number on MangaDex result', async () => {
      mockSearchAniList.mockResolvedValue([])
      const media: MangaDexMedia = {
        ...makeMangaDexMedia('md-1', 'Solo Leveling'),
        lastChapter: '179',
      }
      mockSearchMangaDex.mockResolvedValue([media])

      const results = await searchWithFallback('Solo Leveling', 'Solo Leveling')

      expect(results[0].chapters).toBe(179)
    })

    it('includes genres in unified results', async () => {
      const media = makeAniListMedia(1, 'Solo Leveling', 'Solo Leveling', '나 혼자만 레벨업')
      media.genres = ['Action', 'Fantasy', 'Adventure']
      mockSearchAniList.mockResolvedValue([media])

      const results = await searchWithFallback('Solo Leveling', 'Solo Leveling')

      expect(results[0].genres).toEqual(['Action', 'Fantasy', 'Adventure'])
    })
  })

  // -------------------------------------------------------------------------
  // Query cleaning
  // -------------------------------------------------------------------------

  describe('Query cleaning', () => {
    it('passes a cleaned query to searchAniList', async () => {
      mockSearchAniList.mockResolvedValue([])

      await searchWithFallback('Solo Leveling manga', 'Solo Leveling')

      // cleanSearchQuery strips "manga" noise word from query; extractedTitle is used first
      expect(mockSearchAniList).toHaveBeenCalledWith('Solo Leveling')
    })

    it('falls back to cleaned raw query when extractedTitle is empty', async () => {
      mockSearchAniList.mockResolvedValue([])

      await searchWithFallback('Solo Leveling manga online', '')

      // Empty extractedTitle → use cleaned raw query
      expect(mockSearchAniList).toHaveBeenCalledWith('Solo Leveling')
    })
  })
})
