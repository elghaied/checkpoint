import { describe, it, expect, vi, beforeEach } from 'vitest'
import { searchWithFallback } from './searchService'
import { searchAniList } from './anilist'
import { searchMangaDex } from './mangadex'
import { searchComicK, CloudflareBlockError } from './comick'
import type { AniListMedia, MangaDexMedia, ComicKMedia } from '@/shared/types'
import { CONFIDENCE_THRESHOLD } from '@/shared/constants'

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

vi.mock('./comick', () => ({
  searchComicK: vi.fn(),
  CloudflareBlockError: class CloudflareBlockError extends Error {
    constructor(status: number) {
      super(`CloudflareBlockError: ComicK returned ${status}`)
      this.name = 'CloudflareBlockError'
    }
  },
}))

const mockSearchAniList = vi.mocked(searchAniList)
const mockSearchMangaDex = vi.mocked(searchMangaDex)
const mockSearchComicK = vi.mocked(searchComicK)

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

function makeComicKMedia(hid: string, title: string, altTitles: string[] = [], country = 'jp'): ComicKMedia {
  return {
    hid, slug: hid + '-slug', title, country, status: 1, lastChapter: 100,
    coverUrl: `https://meo.comick.pictures/${hid}-s.jpg`, altTitles, genres: [],
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('searchWithFallback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSearchComicK.mockResolvedValue([])
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

  describe('AniList results with position boost', () => {
    it('does NOT boost AniList results when token overlap is below the minimum floor', async () => {
      // Position boost is suppressed when natural tokenScore < MIN_SCORE_FOR_POSITION_BOOST.
      // Top-ranked results with zero token overlap are almost always unrelated fuzzy hits;
      // boosting them past the threshold would surface wrong suggestions to the user and
      // block fallback to other providers. (Regression: bug where unrelated AniList #1
      // was returned with confidence 0.85 for queries the manga didn't actually match.)
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

      // All have zero shared tokens with "Solo Leveling" → no boost applied.
      // None pass threshold → falls through to low-confidence return (top 5, all at 0).
      expect(results.length).toBeLessThanOrEqual(5)
      expect(results.every((r) => r.confidence === 0)).toBe(true)
    })

    it('still applies position boost when there is at least minimum token overlap (typo case)', async () => {
      // "Solo Lvling" (typo) vs "Solo Leveling" — Jaccard {solo}/{solo,lvling,leveling} = 1/3
      // → natural score 0.3, meets the 0.3 floor, position boost applies → 0.85.
      const media = makeAniListMedia(1, 'Solo Leveling')
      mockSearchAniList.mockResolvedValue([media])

      const results = await searchWithFallback('Solo Lvling', 'Solo Lvling')

      expect(results).toHaveLength(1)
      expect(results[0].confidence).toBeGreaterThanOrEqual(CONFIDENCE_THRESHOLD)
    })

    it('returns fewer than 5 if AniList returned fewer results', async () => {
      mockSearchAniList.mockResolvedValue([
        makeAniListMedia(1, 'Attack on Titan'),
        makeAniListMedia(2, 'Demon Slayer'),
      ])

      const results = await searchWithFallback('Solo Leveling', 'Solo Leveling')

      // Zero token overlap → no boost → fall through to low-confidence return.
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

  // -------------------------------------------------------------------------
  // ComicK provider (first in the 3-provider chain)
  // -------------------------------------------------------------------------

  describe('ComicK provider', () => {
    it('returns ComicK above-threshold result; AniList is always queried in parallel, MangaDex is skipped', async () => {
      mockSearchComicK.mockResolvedValue([makeComicKMedia('ck-1', 'Solo Leveling')])
      // AniList not explicitly mocked → returns [] from beforeEach default? no — falls back to vi.fn() default (undefined).
      // Explicitly stub to empty so the parallel query resolves cleanly.
      mockSearchAniList.mockResolvedValue([])

      const results = await searchWithFallback('Solo Leveling', 'Solo Leveling')

      expect(results).toHaveLength(1)
      expect(results[0].provider).toBe('comick')
      // ComicK + AniList are queried in parallel, so AniList is always called.
      expect(mockSearchAniList).toHaveBeenCalledOnce()
      // MangaDex is only used as a fallback when both ComicK and AniList return empty.
      expect(mockSearchMangaDex).not.toHaveBeenCalled()
    })

    it('shows both ComicK and AniList suggestions, ranking the AniList correct match first', async () => {
      // Regression for the "Serene Bird" case (the actual bug, not the simplified version above):
      // ComicK has 18 fuzzy matches sharing one token with the query — natural Jaccard 1/3 ≈ 0.3,
      // which is at the boost floor → top 2 ComicK results get boosted to 0.85/0.75 (above threshold).
      // AniList has the correct entry (natural 1.0). The old waterfall returned only ComicK's wrong
      // boosted matches and never queried AniList. With parallel + merge, both providers' suggestions
      // appear, but the AniList confident match ranks first by natural confidence.
      mockSearchComicK.mockResolvedValue([
        makeComicKMedia('ck-bird-1', 'Bird Watcher'),
        makeComicKMedia('ck-bird-2', 'Serene Land'),
      ])
      mockSearchAniList.mockResolvedValue([
        makeAniListMedia(110766, 'Serene Bird', 'Serene Bird', '고요새', [], 'KR'),
      ])

      const results = await searchWithFallback('Serene Bird', 'Serene Bird')

      // Top result is the AniList correct match at confidence 1.0.
      expect(results[0].provider).toBe('anilist')
      expect(results[0].id).toBe('110766')
      expect(results[0].confidence).toBe(1.0)
      // ComicK's boosted (but wrong) suggestions also appear, ranked below.
      const comickIds = results.filter((r) => r.provider === 'comick').map((r) => r.id)
      expect(comickIds).toContain('ck-bird-1')
      expect(comickIds).toContain('ck-bird-2')
    })

    it('falls through to AniList when ComicK returns empty', async () => {
      mockSearchComicK.mockResolvedValue([])
      mockSearchAniList.mockResolvedValue([makeAniListMedia(1, 'Solo Leveling')])

      const results = await searchWithFallback('Solo Leveling', 'Solo Leveling')

      expect(mockSearchAniList).toHaveBeenCalledOnce()
      expect(results[0].provider).toBe('anilist')
    })

    it('falls through to AniList on CloudflareBlockError', async () => {
      mockSearchComicK.mockRejectedValue(new CloudflareBlockError(403))
      mockSearchAniList.mockResolvedValue([makeAniListMedia(1, 'Solo Leveling')])

      const results = await searchWithFallback('Solo Leveling', 'Solo Leveling')

      expect(mockSearchAniList).toHaveBeenCalledOnce()
      expect(results[0].provider).toBe('anilist')
    })

    it('falls through to MangaDex when both ComicK and AniList return empty', async () => {
      mockSearchComicK.mockResolvedValue([])
      mockSearchAniList.mockResolvedValue([])
      mockSearchMangaDex.mockResolvedValue([makeMangaDexMedia('md-1', 'Solo Leveling')])

      const results = await searchWithFallback('Solo Leveling', 'Solo Leveling')

      expect(mockSearchMangaDex).toHaveBeenCalledOnce()
      expect(results[0].provider).toBe('mangadex')
    })

    it('zero-overlap ComicK results are not boosted; only the AniList confident match is returned', async () => {
      // ComicK results that share no tokens with the query get natural score 0 and (per the
      // boost floor) confidence stays at 0 — well below threshold. The AniList confident match
      // is returned alone because the ComicK results are below the threshold filter.
      mockSearchComicK.mockResolvedValue([
        makeComicKMedia('ck-wrong-1', 'Wandering Cloud'),
        makeComicKMedia('ck-wrong-2', 'Iron Mountain'),
        makeComicKMedia('ck-wrong-3', 'Empty Sky'),
      ])
      mockSearchAniList.mockResolvedValue([
        makeAniListMedia(110766, 'Serene Bird', 'Serene Bird', '고요새', [], 'KR'),
      ])

      const results = await searchWithFallback('Serene Bird', 'Serene Bird')

      expect(mockSearchAniList).toHaveBeenCalledOnce()
      expect(results).toHaveLength(1)
      expect(results[0].provider).toBe('anilist')
      expect(results[0].id).toBe('110766')
      expect(results[0].confidence).toBe(1.0)
    })

    it('normalizes ComicK result into UnifiedSearchResult shape', async () => {
      const comickMedia = makeComicKMedia('ck-42', 'Solo Leveling', ['Only I Level Up'], 'kr')
      mockSearchComicK.mockResolvedValue([comickMedia])

      const results = await searchWithFallback('Solo Leveling', 'Solo Leveling')

      expect(results).toHaveLength(1)
      const result = results[0]
      expect(result.provider).toBe('comick')
      expect(result.id).toBe('ck-42')
      expect(result.title.primary).toBe('Solo Leveling')
      expect(result.title.alt).toContain('Only I Level Up')
      expect(result.format).toBe('MANHWA') // kr → MANHWA
      expect(result.chapters).toBe(100)
      expect(result.confidence).toBe(1.0)
      expect(result.originalData).toBe(comickMedia)
    })
  })
})
