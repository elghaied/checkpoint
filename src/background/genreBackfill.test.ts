import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runGenreBackfill } from './genreBackfill'
import { storageService } from '@/storage'
import { fetchBatchChapterInfo, searchAniList, bestTitleScore } from './anilist'
import { searchMangaDex } from './mangadex'
import type { TrackedItem, AniListMedia, MangaDexMedia } from '@/shared/types'

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@/storage', () => ({
  storageService: {
    getAll: vi.fn(),
    update: vi.fn(),
    writeBackfillProgress: vi.fn(),
  },
}))

vi.mock('./anilist', () => ({
  fetchBatchChapterInfo: vi.fn(),
  searchAniList: vi.fn(),
  bestTitleScore: vi.fn(),
}))

vi.mock('./mangadex', () => ({
  searchMangaDex: vi.fn(),
}))

const mockGetAll = vi.mocked(storageService.getAll)
const mockUpdate = vi.mocked(storageService.update)
const mockWriteBackfillProgress = vi.mocked(storageService.writeBackfillProgress)
const mockFetchBatchChapterInfo = vi.mocked(fetchBatchChapterInfo)
const mockSearchAniList = vi.mocked(searchAniList)
const mockSearchMangaDex = vi.mocked(searchMangaDex)
const mockBestTitleScore = vi.mocked(bestTitleScore)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTrackedItem(
  overrides: Partial<TrackedItem> & { providerId: string; provider: 'anilist' | 'mangadex' }
): TrackedItem {
  return {
    provider: overrides.provider,
    providerId: overrides.providerId,
    mediaType: 'manga',
    format: 'MANGA',
    titles: { main: overrides.titles?.main ?? 'Test Manga', alt: overrides.titles?.alt ?? [] },
    coverImage: '',
    progress: { unit: 'chapter', value: '1' },
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
    pinned: false,
    ...overrides,
  }
}

function makeAniListMedia(id: number, genres: string[]): AniListMedia {
  return {
    id,
    type: 'MANGA',
    format: 'MANGA',
    title: { romaji: 'Test Manga', english: null, native: '' },
    synonyms: [],
    coverImage: { large: '', medium: '' },
    countryOfOrigin: 'JP',
    status: 'RELEASING',
    chapters: null,
    genres,
  }
}

function makeMangaDexMedia(id: string, genres: string[]): MangaDexMedia {
  return {
    id,
    title: 'Test Manga',
    altTitles: [],
    coverUrl: '',
    originalLanguage: 'ja',
    status: null,
    lastChapter: null,
    genres,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runGenreBackfill', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWriteBackfillProgress.mockResolvedValue(undefined)
    mockUpdate.mockResolvedValue(undefined)
    mockFetchBatchChapterInfo.mockResolvedValue(new Map())
    mockSearchAniList.mockResolvedValue([])
    mockSearchMangaDex.mockResolvedValue([])
    mockBestTitleScore.mockReturnValue(1)
  })

  // -------------------------------------------------------------------------
  // Skipping already-backfilled items
  // -------------------------------------------------------------------------

  describe('skipping already-backfilled items', () => {
    it('skips items that already have genresBackfilled = true', async () => {
      const alreadyDone = makeTrackedItem({
        provider: 'anilist',
        providerId: '123',
        genresBackfilled: true,
        genres: ['Action'],
      })
      mockGetAll.mockResolvedValue([alreadyDone])

      await runGenreBackfill()

      expect(mockFetchBatchChapterInfo).not.toHaveBeenCalled()
      expect(mockUpdate).not.toHaveBeenCalled()
    })

    it('writes done progress immediately when all items are already backfilled', async () => {
      const alreadyDone = makeTrackedItem({
        provider: 'anilist',
        providerId: '123',
        genresBackfilled: true,
      })
      mockGetAll.mockResolvedValue([alreadyDone])

      await runGenreBackfill()

      expect(mockWriteBackfillProgress).toHaveBeenCalledWith({
        completed: 0,
        total: 0,
        status: 'done',
      })
    })

    it('returns early with no API calls when all items are done', async () => {
      mockGetAll.mockResolvedValue([
        makeTrackedItem({ provider: 'anilist', providerId: '1', genresBackfilled: true }),
        makeTrackedItem({ provider: 'mangadex', providerId: 'md-1', genresBackfilled: true }),
      ])

      await runGenreBackfill()

      expect(mockFetchBatchChapterInfo).not.toHaveBeenCalled()
      expect(mockSearchMangaDex).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // Empty storage
  // -------------------------------------------------------------------------

  describe('empty storage', () => {
    it('handles empty item list gracefully', async () => {
      mockGetAll.mockResolvedValue([])

      await runGenreBackfill()

      expect(mockFetchBatchChapterInfo).not.toHaveBeenCalled()
      expect(mockSearchMangaDex).not.toHaveBeenCalled()
      expect(mockWriteBackfillProgress).toHaveBeenCalledWith({
        completed: 0,
        total: 0,
        status: 'done',
      })
    })
  })

  // -------------------------------------------------------------------------
  // AniList genre fetching
  // -------------------------------------------------------------------------

  describe('AniList items', () => {
    it('fetches genres from AniList for anilist-sourced items', async () => {
      const item = makeTrackedItem({ provider: 'anilist', providerId: '123', titles: { main: 'Solo Leveling', alt: [] } })
      mockGetAll.mockResolvedValue([item])

      const batchResult = new Map([
        ['123', { id: '123', status: 'RELEASING', chapters: null, genres: ['Action', 'Fantasy'] }],
      ])
      mockFetchBatchChapterInfo.mockResolvedValue(batchResult)

      await runGenreBackfill()

      expect(mockFetchBatchChapterInfo).toHaveBeenCalledWith(['123'])
      expect(mockUpdate).toHaveBeenCalledWith('123', {
        genres: ['Action', 'Fantasy'],
        genresBackfilled: true,
      })
    })

    it('calls fetchBatchChapterInfo with all anilist provider IDs at once', async () => {
      const items = [
        makeTrackedItem({ provider: 'anilist', providerId: '1' }),
        makeTrackedItem({ provider: 'anilist', providerId: '2' }),
        makeTrackedItem({ provider: 'anilist', providerId: '3' }),
      ]
      mockGetAll.mockResolvedValue(items)

      const batchResult = new Map([
        ['1', { id: '1', status: 'RELEASING', chapters: null, genres: ['Action'] }],
        ['2', { id: '2', status: 'RELEASING', chapters: null, genres: ['Romance'] }],
        ['3', { id: '3', status: 'RELEASING', chapters: null, genres: ['Fantasy'] }],
      ])
      mockFetchBatchChapterInfo.mockResolvedValue(batchResult)

      await runGenreBackfill()

      expect(mockFetchBatchChapterInfo).toHaveBeenCalledWith(['1', '2', '3'])
      expect(mockUpdate).toHaveBeenCalledTimes(3)
    })

    it('reports progress via writeBackfillProgress', async () => {
      const item = makeTrackedItem({ provider: 'anilist', providerId: '42' })
      mockGetAll.mockResolvedValue([item])

      const batchResult = new Map([
        ['42', { id: '42', status: 'RELEASING', chapters: null, genres: ['Action'] }],
      ])
      mockFetchBatchChapterInfo.mockResolvedValue(batchResult)

      await runGenreBackfill()

      // Should write running progress at start, then done at end
      const calls = mockWriteBackfillProgress.mock.calls
      expect(calls[0][0]).toMatchObject({ status: 'running', total: 1 })
      expect(calls[calls.length - 1][0]).toMatchObject({ status: 'done', completed: 1, total: 1 })
    })
  })

  // -------------------------------------------------------------------------
  // AniList empty genres → MangaDex fallback
  // -------------------------------------------------------------------------

  describe('fallback to MangaDex when AniList returns empty genres', () => {
    it('falls back to MangaDex when AniList returns empty genres for an anilist item', async () => {
      const item = makeTrackedItem({
        provider: 'anilist',
        providerId: '123',
        titles: { main: 'My Hero Academia', alt: [] },
      })
      mockGetAll.mockResolvedValue([item])

      // AniList returns empty genres
      const batchResult = new Map([
        ['123', { id: '123', status: 'RELEASING', chapters: null, genres: [] }],
      ])
      mockFetchBatchChapterInfo.mockResolvedValue(batchResult)

      // MangaDex has genres
      mockSearchMangaDex.mockResolvedValue([
        makeMangaDexMedia('mdx-99', ['Action', 'School Life']),
      ])

      await runGenreBackfill()

      expect(mockSearchMangaDex).toHaveBeenCalledWith('My Hero Academia')
      expect(mockUpdate).toHaveBeenCalledWith('123', {
        genres: ['Action', 'School Life'],
        genresBackfilled: true,
      })
    })

    it('falls back to MangaDex when item is not in AniList batch results', async () => {
      const item = makeTrackedItem({
        provider: 'anilist',
        providerId: '999',
        titles: { main: 'Unknown Manga', alt: [] },
      })
      mockGetAll.mockResolvedValue([item])

      // AniList batch doesn't return this item
      mockFetchBatchChapterInfo.mockResolvedValue(new Map())

      mockSearchMangaDex.mockResolvedValue([
        makeMangaDexMedia('mdx-1', ['Mystery']),
      ])

      await runGenreBackfill()

      expect(mockSearchMangaDex).toHaveBeenCalledWith('Unknown Manga')
      expect(mockUpdate).toHaveBeenCalledWith('999', {
        genres: ['Mystery'],
        genresBackfilled: true,
      })
    })
  })

  // -------------------------------------------------------------------------
  // MangaDex items
  // -------------------------------------------------------------------------

  describe('MangaDex items', () => {
    it('searches MangaDex by title for mangadex-sourced items and uses matching result', async () => {
      const item = makeTrackedItem({
        provider: 'mangadex',
        providerId: 'mdx-abc123',
        titles: { main: 'Berserk', alt: [] },
      })
      mockGetAll.mockResolvedValue([item])

      mockSearchMangaDex.mockResolvedValue([
        { ...makeMangaDexMedia('mdx-abc123', ['Dark Fantasy', 'Action']), title: 'Berserk' },
      ])

      await runGenreBackfill()

      expect(mockFetchBatchChapterInfo).not.toHaveBeenCalled()
      expect(mockSearchMangaDex).toHaveBeenCalledWith('Berserk')
      expect(mockUpdate).toHaveBeenCalledWith('mdx-abc123', {
        genres: ['Dark Fantasy', 'Action'],
        genresBackfilled: true,
      })
    })

    it('matches MangaDex search result by providerId when multiple results returned', async () => {
      const item = makeTrackedItem({
        provider: 'mangadex',
        providerId: 'mdx-correct',
        titles: { main: 'Bleach', alt: [] },
      })
      mockGetAll.mockResolvedValue([item])

      mockSearchMangaDex.mockResolvedValue([
        makeMangaDexMedia('mdx-wrong', ['Shonen']),
        makeMangaDexMedia('mdx-correct', ['Action', 'Supernatural']),
        makeMangaDexMedia('mdx-other', ['Comedy']),
      ])

      await runGenreBackfill()

      expect(mockUpdate).toHaveBeenCalledWith('mdx-correct', {
        genres: ['Action', 'Supernatural'],
        genresBackfilled: true,
      })
    })

    it('falls back to AniList when MangaDex search returns empty genres', async () => {
      const item = makeTrackedItem({
        provider: 'mangadex',
        providerId: 'mdx-abc',
        titles: { main: 'Naruto', alt: [] },
      })
      mockGetAll.mockResolvedValue([item])

      // MangaDex search finds the item but with empty genres
      mockSearchMangaDex.mockResolvedValue([
        makeMangaDexMedia('mdx-abc', []),
      ])

      // AniList has genres
      mockSearchAniList.mockResolvedValue([
        makeAniListMedia(101, ['Action', 'Adventure']),
      ])

      await runGenreBackfill()

      expect(mockSearchAniList).toHaveBeenCalledWith('Naruto')
      expect(mockUpdate).toHaveBeenCalledWith('mdx-abc', {
        genres: ['Action', 'Adventure'],
        genresBackfilled: true,
      })
    })

    it('falls back to AniList when MangaDex returns no matching result by providerId', async () => {
      const item = makeTrackedItem({
        provider: 'mangadex',
        providerId: 'mdx-specific',
        titles: { main: 'One Piece', alt: [] },
      })
      mockGetAll.mockResolvedValue([item])

      // MangaDex search returns no match with the correct ID
      mockSearchMangaDex.mockResolvedValue([
        makeMangaDexMedia('mdx-different', ['Adventure']),
      ])

      mockSearchAniList.mockResolvedValue([
        makeAniListMedia(202, ['Adventure', 'Comedy']),
      ])

      await runGenreBackfill()

      expect(mockSearchAniList).toHaveBeenCalledWith('One Piece')
      expect(mockUpdate).toHaveBeenCalledWith('mdx-specific', {
        genres: ['Adventure', 'Comedy'],
        genresBackfilled: true,
      })
    })
  })

  // -------------------------------------------------------------------------
  // Both providers return nothing
  // -------------------------------------------------------------------------

  describe('both providers return empty', () => {
    it('marks item as backfilled with empty genres when both providers return nothing', async () => {
      const item = makeTrackedItem({
        provider: 'anilist',
        providerId: '555',
        titles: { main: 'Obscure Title', alt: [] },
      })
      mockGetAll.mockResolvedValue([item])

      // AniList returns empty genres
      mockFetchBatchChapterInfo.mockResolvedValue(
        new Map([['555', { id: '555', status: null, chapters: null, genres: [] }]])
      )
      // MangaDex fallback also empty
      mockSearchMangaDex.mockResolvedValue([])

      await runGenreBackfill()

      expect(mockUpdate).toHaveBeenCalledWith('555', {
        genres: [],
        genresBackfilled: true,
      })
    })

    it('marks mangadex item as backfilled with empty genres when both providers return nothing', async () => {
      const item = makeTrackedItem({
        provider: 'mangadex',
        providerId: 'mdx-obscure',
        titles: { main: 'Very Obscure Title', alt: [] },
      })
      mockGetAll.mockResolvedValue([item])

      mockSearchMangaDex.mockResolvedValue([])
      mockSearchAniList.mockResolvedValue([])

      await runGenreBackfill()

      expect(mockUpdate).toHaveBeenCalledWith('mdx-obscure', {
        genres: [],
        genresBackfilled: true,
      })
    })
  })

  // -------------------------------------------------------------------------
  // Progress reporting
  // -------------------------------------------------------------------------

  describe('progress reporting', () => {
    it('writes initial running progress with correct total', async () => {
      const items = [
        makeTrackedItem({ provider: 'anilist', providerId: '1' }),
        makeTrackedItem({ provider: 'anilist', providerId: '2' }),
      ]
      mockGetAll.mockResolvedValue(items)

      const batchResult = new Map([
        ['1', { id: '1', status: null, chapters: null, genres: ['Action'] }],
        ['2', { id: '2', status: null, chapters: null, genres: ['Romance'] }],
      ])
      mockFetchBatchChapterInfo.mockResolvedValue(batchResult)

      await runGenreBackfill()

      expect(mockWriteBackfillProgress).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'running', total: 2, completed: 0 })
      )
    })

    it('writes final done progress with completed count', async () => {
      const items = [
        makeTrackedItem({ provider: 'anilist', providerId: '1' }),
        makeTrackedItem({ provider: 'anilist', providerId: '2' }),
      ]
      mockGetAll.mockResolvedValue(items)

      const batchResult = new Map([
        ['1', { id: '1', status: null, chapters: null, genres: ['Action'] }],
        ['2', { id: '2', status: null, chapters: null, genres: ['Romance'] }],
      ])
      mockFetchBatchChapterInfo.mockResolvedValue(batchResult)

      await runGenreBackfill()

      const lastCall = mockWriteBackfillProgress.mock.calls[mockWriteBackfillProgress.mock.calls.length - 1]
      expect(lastCall[0]).toEqual({ status: 'done', completed: 2, total: 2 })
    })
  })

  // -------------------------------------------------------------------------
  // Mixed provider items
  // -------------------------------------------------------------------------

  describe('mixed provider items', () => {
    it('processes anilist and mangadex items in the same run', async () => {
      const anilistItem = makeTrackedItem({
        provider: 'anilist',
        providerId: '100',
        titles: { main: 'Manga A', alt: [] },
      })
      const mdxItem = makeTrackedItem({
        provider: 'mangadex',
        providerId: 'mdx-200',
        titles: { main: 'Manga B', alt: [] },
      })
      mockGetAll.mockResolvedValue([anilistItem, mdxItem])

      mockFetchBatchChapterInfo.mockResolvedValue(
        new Map([['100', { id: '100', status: null, chapters: null, genres: ['Action'] }]])
      )
      mockSearchMangaDex.mockResolvedValue([
        makeMangaDexMedia('mdx-200', ['Romance']),
      ])

      await runGenreBackfill()

      expect(mockUpdate).toHaveBeenCalledWith('100', {
        genres: ['Action'],
        genresBackfilled: true,
      })
      expect(mockUpdate).toHaveBeenCalledWith('mdx-200', {
        genres: ['Romance'],
        genresBackfilled: true,
      })
    })
  })
})
