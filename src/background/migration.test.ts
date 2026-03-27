import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resetChromeStorage } from '@/__mocks__/chrome'

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('./comick', () => ({
  searchComicK: vi.fn(),
  fetchComicDetail: vi.fn(),
  CloudflareBlockError: class extends Error {},
}))

vi.mock('@/storage', () => ({
  storageService: {
    getAll: vi.fn(),
    update: vi.fn(),
  },
}))

import { migrateItemsToComicK } from './migration'
import { searchComicK, fetchComicDetail } from './comick'
import type { TrackedItem, ComicKMedia } from '@/shared/types'

const mockSearchComicK = vi.mocked(searchComicK)
const mockFetchComicDetail = vi.mocked(fetchComicDetail)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTrackedItem(
  overrides: Partial<TrackedItem> & { providerId: string; provider: 'anilist' | 'mangadex' | 'comick' }
): TrackedItem {
  return {
    provider: overrides.provider,
    providerId: overrides.providerId,
    mediaType: 'manga',
    format: 'MANGA',
    titles: { main: overrides.titles?.main ?? 'Test Manga', alt: overrides.titles?.alt ?? [] },
    coverImage: '',
    progress: { unit: 'chapter', value: '5' },
    lastUrl: 'https://example.com/manga/test/ch5',
    updatedAt: Date.now(),
    createdAt: Date.now(),
    chaptersWhenAdded: null,
    latestKnownChapters: null,
    lastApiCheck: null,
    notificationsEnabled: true,
    anilistStatus: null,
    genres: [],
    tags: [],
    genresBackfilled: true,
    comickHid: null,
    comickSlug: null,
    anilistId: null,
    pinned: false,
    ...overrides,
  }
}

function makeComicKMedia(overrides: Partial<ComicKMedia> = {}): ComicKMedia {
  return {
    hid: 'abc123',
    slug: 'test-manga',
    title: 'Test Manga',
    country: 'jp',
    status: 1,
    lastChapter: 100,
    coverUrl: 'https://meo.comick.pictures/test.jpg',
    altTitles: [],
    genres: [],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('migrateItemsToComicK', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetChromeStorage()
  })

  // -------------------------------------------------------------------------
  // Test 1: adds ComicK cross-reference when title matches with high confidence
  // -------------------------------------------------------------------------

  it('adds ComicK cross-reference when title matches with high confidence', async () => {
    const item = makeTrackedItem({
      provider: 'anilist',
      providerId: '123456',
      titles: { main: 'Solo Leveling', alt: [] },
    })

    const searchResult = makeComicKMedia({
      hid: 'hid-solo',
      slug: 'solo-leveling',
      title: 'Solo Leveling',
    })

    mockSearchComicK.mockResolvedValue([searchResult])
    mockFetchComicDetail.mockResolvedValue({
      hid: 'hid-solo',
      slug: 'solo-leveling',
      title: 'Solo Leveling',
      country: 'kr',
      status: 2,
      lastChapter: 179,
      coverUrl: 'https://meo.comick.pictures/solo.jpg',
      altTitles: [],
      genres: ['Action', 'Fantasy'],
      links: { anilistId: '123456', malId: null },
    })

    const result = await migrateItemsToComicK([item])

    expect(result.migrated).toBe(1)
    expect(result.skipped).toBe(0)
    expect(result.items[0].comickHid).toBe('hid-solo')
    expect(result.items[0].comickSlug).toBe('solo-leveling')
    expect(result.items[0].anilistId).toBe('123456')
  })

  // -------------------------------------------------------------------------
  // Test 2: skips items already having comickSlug
  // -------------------------------------------------------------------------

  it('skips items already having comickSlug', async () => {
    const item = makeTrackedItem({
      provider: 'anilist',
      providerId: '111',
      comickSlug: 'already-set',
      comickHid: 'already-hid',
    })

    const result = await migrateItemsToComicK([item])

    expect(mockSearchComicK).not.toHaveBeenCalled()
    expect(result.skipped).toBe(1)
    expect(result.migrated).toBe(0)
  })

  // -------------------------------------------------------------------------
  // Test 3: confirms AniList ID match for higher confidence
  // -------------------------------------------------------------------------

  it('confirms AniList ID match for higher confidence', async () => {
    const item = makeTrackedItem({
      provider: 'anilist',
      providerId: '98765',
      titles: { main: 'Chainsaw Man', alt: [] },
    })

    // A search result with a somewhat similar title
    const searchResult = makeComicKMedia({
      hid: 'hid-csm',
      slug: 'chainsaw-man',
      title: 'Chainsaw Man',
    })

    mockSearchComicK.mockResolvedValue([searchResult])
    mockFetchComicDetail.mockResolvedValue({
      hid: 'hid-csm',
      slug: 'chainsaw-man',
      title: 'Chainsaw Man',
      country: 'jp',
      status: 2,
      lastChapter: 97,
      coverUrl: 'https://meo.comick.pictures/csm.jpg',
      altTitles: [],
      genres: ['Action', 'Horror'],
      links: { anilistId: '98765', malId: null },
    })

    const result = await migrateItemsToComicK([item])

    expect(result.migrated).toBe(1)
    expect(result.skipped).toBe(0)
    expect(result.items[0].comickSlug).toBe('chainsaw-man')
    expect(result.items[0].anilistId).toBe('98765')
  })

  // -------------------------------------------------------------------------
  // Test 4: skips items with low confidence and no ID match
  // -------------------------------------------------------------------------

  it('skips items with low confidence and no ID match', async () => {
    const item = makeTrackedItem({
      provider: 'anilist',
      providerId: '555',
      titles: { main: 'Specific Manga Title', alt: [] },
    })

    // Search returns a completely unrelated title (low score)
    const unrelatedResult = makeComicKMedia({
      hid: 'hid-other',
      slug: 'completely-different',
      title: 'Completely Different Manga',
    })

    mockSearchComicK.mockResolvedValue([unrelatedResult])
    // fetchComicDetail should not be called at all (no ID match to check)
    mockFetchComicDetail.mockResolvedValue({
      hid: 'hid-other',
      slug: 'completely-different',
      title: 'Completely Different Manga',
      country: 'jp',
      status: 1,
      lastChapter: 50,
      coverUrl: '',
      altTitles: [],
      genres: [],
      links: { anilistId: '999', malId: null }, // different anilist ID
    })

    const result = await migrateItemsToComicK([item])

    expect(result.skipped).toBe(1)
    expect(result.migrated).toBe(0)
  })

  // -------------------------------------------------------------------------
  // Test 5: handles ComicK search failure gracefully
  // -------------------------------------------------------------------------

  it('handles ComicK search failure gracefully', async () => {
    const item = makeTrackedItem({
      provider: 'anilist',
      providerId: '777',
      titles: { main: 'Some Manga', alt: [] },
    })

    mockSearchComicK.mockRejectedValue(new Error('Network error'))

    const result = await migrateItemsToComicK([item])

    expect(result.skipped).toBe(1)
    expect(result.migrated).toBe(0)
    // Should not crash — the function should handle the error gracefully
  })

  // -------------------------------------------------------------------------
  // Test 6: preserves existing progress and metadata
  // -------------------------------------------------------------------------

  it('preserves existing progress and metadata after migration', async () => {
    const originalProgress = { unit: 'chapter' as const, value: '42' }
    const originalTags = ['favorite', 'completed']
    const item = makeTrackedItem({
      provider: 'anilist',
      providerId: '999',
      titles: { main: 'Berserk', alt: [] },
      progress: originalProgress,
      tags: originalTags,
      notificationsEnabled: false,
    })

    const searchResult = makeComicKMedia({
      hid: 'hid-berserk',
      slug: 'berserk',
      title: 'Berserk',
    })

    mockSearchComicK.mockResolvedValue([searchResult])
    mockFetchComicDetail.mockResolvedValue({
      hid: 'hid-berserk',
      slug: 'berserk',
      title: 'Berserk',
      country: 'jp',
      status: 4,
      lastChapter: 364,
      coverUrl: 'https://meo.comick.pictures/berserk.jpg',
      altTitles: [],
      genres: ['Dark Fantasy', 'Action'],
      links: { anilistId: '999', malId: null },
    })

    const result = await migrateItemsToComicK([item])

    expect(result.migrated).toBe(1)
    const migratedItem = result.items[0]

    // Original fields must be preserved
    expect(migratedItem.provider).toBe('anilist')
    expect(migratedItem.providerId).toBe('999')
    expect(migratedItem.progress).toEqual(originalProgress)
    expect(migratedItem.tags).toEqual(originalTags)
    expect(migratedItem.notificationsEnabled).toBe(false)

    // New cross-reference fields added
    expect(migratedItem.comickHid).toBe('hid-berserk')
    expect(migratedItem.comickSlug).toBe('berserk')
    expect(migratedItem.anilistId).toBe('999')

    // Provider NOT changed
    expect(migratedItem.provider).toBe('anilist')
  })
})
