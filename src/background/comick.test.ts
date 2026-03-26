import { describe, it, expect, vi, beforeEach } from 'vitest'
import { searchComicK, fetchComicDetail, fetchBatchComicKInfo, CloudflareBlockError } from './comick'

// ---------------------------------------------------------------------------
// Mock fetchWithRetry from ./retry
// ---------------------------------------------------------------------------

vi.mock('./retry', () => ({
  fetchWithRetry: vi.fn(),
}))

// Import mocked fetchWithRetry after the mock is set up
import { fetchWithRetry } from './retry'

const mockFetchWithRetry = vi.mocked(fetchWithRetry)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response
}

function makeSearchItem(overrides: Partial<{
  hid: string
  slug: string
  title: string
  country: string
  status: number
  last_chapter: number | null
  cover_url: string
  md_titles: Array<{ title: string }>
}> = {}) {
  return {
    hid: 'abc123',
    slug: 'test-manga',
    title: 'Test Manga',
    country: 'jp',
    status: 1,
    last_chapter: 200.5,
    cover_url: 'https://meo.comick.pictures/test.jpg',
    md_titles: [{ title: 'Alt Title 1' }, { title: 'Alt Title 2' }],
    ...overrides,
  }
}

function makeDetailResponse(overrides: Partial<{
  hid: string
  slug: string
  title: string
  country: string
  status: number
  last_chapter: number | null
  cover_url: string
  md_titles: Array<{ title: string }>
  md_comic_md_genres: Array<{ md_genres: { name: string; group: string } }>
  links: Record<string, string | null> | null
}> = {}) {
  return {
    comic: {
      hid: 'abc123',
      slug: 'test-manga',
      title: 'Test Manga',
      country: 'jp',
      status: 1,
      last_chapter: 200.5,
      cover_url: 'https://meo.comick.pictures/test.jpg',
      md_titles: [{ title: 'Alt Title 1' }],
      md_comic_md_genres: [
        { md_genres: { name: 'Action', group: 'Genre' } },
        { md_genres: { name: 'Adventure', group: 'Genre' } },
        { md_genres: { name: 'Magic', group: 'Theme' } },
        { md_genres: { name: 'Shounen', group: 'Demographic' } }, // should be excluded
      ],
      links: { al: '12345', mal: '67890' },
      ...overrides,
    },
  }
}

// ---------------------------------------------------------------------------
// searchComicK
// ---------------------------------------------------------------------------

describe('searchComicK', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns normalized results from search endpoint', async () => {
    mockFetchWithRetry.mockResolvedValue(makeResponse([makeSearchItem()]))

    const results = await searchComicK('normalize-results-test')

    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({
      hid: 'abc123',
      slug: 'test-manga',
      title: 'Test Manga',
      country: 'jp',
      status: 1,
      lastChapter: 200, // floored from 200.5
      coverUrl: 'https://meo.comick.pictures/test.jpg',
    })
  })

  it('floors last_chapter float to integer', async () => {
    mockFetchWithRetry.mockResolvedValue(makeResponse([makeSearchItem({ last_chapter: 123.9 })]))

    const results = await searchComicK('floor-chapter-test')

    expect(results[0].lastChapter).toBe(123)
  })

  it('extracts alt titles from md_titles array', async () => {
    mockFetchWithRetry.mockResolvedValue(
      makeResponse([makeSearchItem({ md_titles: [{ title: 'Alt One' }, { title: 'Alt Two' }] })])
    )

    const results = await searchComicK('alt-titles-test')

    expect(results[0].altTitles).toEqual(['Alt One', 'Alt Two'])
  })

  it('returns genres as empty array from search (resolved from detail)', async () => {
    mockFetchWithRetry.mockResolvedValue(makeResponse([makeSearchItem()]))

    const results = await searchComicK('genres-empty-test')

    expect(results[0].genres).toEqual([])
  })

  it('includes tachiyomi=true in request URL', async () => {
    mockFetchWithRetry.mockResolvedValue(makeResponse([]))

    await searchComicK('my manga tachiyomi check')

    const calledUrl = mockFetchWithRetry.mock.calls[0][0] as string
    expect(calledUrl).toContain('tachiyomi=true')
  })

  it('includes query in request URL', async () => {
    mockFetchWithRetry.mockResolvedValue(makeResponse([]))

    await searchComicK('solo leveling')

    const calledUrl = mockFetchWithRetry.mock.calls[0][0] as string
    expect(calledUrl).toContain('solo+leveling')
  })

  it('returns empty array on network error', async () => {
    mockFetchWithRetry.mockRejectedValue(new Error('Network failure'))

    const results = await searchComicK('network-error-test')

    expect(results).toEqual([])
  })

  it('throws CloudflareBlockError on 403', async () => {
    mockFetchWithRetry.mockResolvedValue(makeResponse({ error: 'Forbidden' }, 403))

    await expect(searchComicK('cloudflare-403-test')).rejects.toThrow(CloudflareBlockError)
  })

  it('throws CloudflareBlockError on 503', async () => {
    mockFetchWithRetry.mockResolvedValue(makeResponse({ error: 'Service Unavailable' }, 503))

    await expect(searchComicK('cloudflare-503-test')).rejects.toThrow(CloudflareBlockError)
  })

  it('returns empty array on other HTTP errors (e.g. 500)', async () => {
    mockFetchWithRetry.mockResolvedValue(makeResponse({ error: 'Internal Server Error' }, 500))

    const results = await searchComicK('http-500-error-test')

    expect(results).toEqual([])
  })

  it('handles null last_chapter', async () => {
    mockFetchWithRetry.mockResolvedValue(
      makeResponse([makeSearchItem({ last_chapter: null })])
    )

    const results = await searchComicK('null-chapter-test')

    expect(results[0].lastChapter).toBeNull()
  })

  it('uses cache for repeated queries', async () => {
    mockFetchWithRetry.mockResolvedValue(makeResponse([makeSearchItem()]))

    await searchComicK('cached query unique key')
    await searchComicK('cached query unique key')

    // fetchWithRetry should only be called once — second call hits cache
    expect(mockFetchWithRetry).toHaveBeenCalledTimes(1)
  })

  it('caches differently for different queries', async () => {
    mockFetchWithRetry.mockResolvedValue(makeResponse([]))

    await searchComicK('cache-different-key-alpha')
    await searchComicK('cache-different-key-beta')

    expect(mockFetchWithRetry).toHaveBeenCalledTimes(2)
  })
})

// ---------------------------------------------------------------------------
// fetchComicDetail
// ---------------------------------------------------------------------------

describe('fetchComicDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns comic detail with links (anilistId, malId)', async () => {
    mockFetchWithRetry.mockResolvedValue(makeResponse(makeDetailResponse()))

    const detail = await fetchComicDetail('test-manga')

    expect(detail).not.toBeNull()
    expect(detail!.links).toMatchObject({
      anilistId: '12345',
      malId: '67890',
    })
  })

  it('extracts genres from md_comic_md_genres where group is Genre or Theme', async () => {
    mockFetchWithRetry.mockResolvedValue(makeResponse(makeDetailResponse()))

    const detail = await fetchComicDetail('test-manga-genres')

    expect(detail!.genres).toContain('Action')
    expect(detail!.genres).toContain('Adventure')
    expect(detail!.genres).toContain('Magic') // Theme group — included
    expect(detail!.genres).not.toContain('Shounen') // Demographic — excluded
  })

  it('returns full detail shape', async () => {
    mockFetchWithRetry.mockResolvedValue(makeResponse(makeDetailResponse()))

    const detail = await fetchComicDetail('test-manga-full')

    expect(detail).toMatchObject({
      hid: 'abc123',
      slug: 'test-manga',
      title: 'Test Manga',
      country: 'jp',
      status: 1,
      lastChapter: 200, // floored from 200.5
      coverUrl: 'https://meo.comick.pictures/test.jpg',
    })
    expect(detail!.altTitles).toContain('Alt Title 1')
  })

  it('returns null on 404', async () => {
    mockFetchWithRetry.mockResolvedValue(makeResponse({ error: 'Not Found' }, 404))

    const detail = await fetchComicDetail('nonexistent-slug')

    expect(detail).toBeNull()
  })

  it('returns null on network error', async () => {
    mockFetchWithRetry.mockRejectedValue(new Error('Network error'))

    const detail = await fetchComicDetail('network-fail-slug')

    expect(detail).toBeNull()
  })

  it('handles missing links gracefully', async () => {
    mockFetchWithRetry.mockResolvedValue(
      makeResponse(makeDetailResponse({ links: {} }))
    )

    const detail = await fetchComicDetail('missing-links-slug')

    expect(detail).not.toBeNull()
    expect(detail!.links).toMatchObject({
      anilistId: null,
      malId: null,
    })
  })

  it('handles null links field gracefully', async () => {
    mockFetchWithRetry.mockResolvedValue(
      makeResponse(makeDetailResponse({ links: null as unknown as Record<string, string> }))
    )

    const detail = await fetchComicDetail('null-links-slug')

    expect(detail).not.toBeNull()
    expect(detail!.links.anilistId).toBeNull()
    expect(detail!.links.malId).toBeNull()
  })

  it('includes tachiyomi=true in detail URL', async () => {
    mockFetchWithRetry.mockResolvedValue(makeResponse(makeDetailResponse()))

    await fetchComicDetail('tachiyomi-url-test')

    const calledUrl = mockFetchWithRetry.mock.calls[0][0] as string
    expect(calledUrl).toContain('tachiyomi=true')
    expect(calledUrl).toContain('/comic/tachiyomi-url-test')
  })

  it('handles empty genres array', async () => {
    mockFetchWithRetry.mockResolvedValue(
      makeResponse(makeDetailResponse({ md_comic_md_genres: [] }))
    )

    const detail = await fetchComicDetail('empty-genres-slug')

    expect(detail!.genres).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// fetchBatchComicKInfo
// ---------------------------------------------------------------------------

describe('fetchBatchComicKInfo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns empty map for empty input', async () => {
    const result = await fetchBatchComicKInfo([])

    expect(result.size).toBe(0)
    expect(mockFetchWithRetry).not.toHaveBeenCalled()
  })

  it('fetches chapter info for multiple slugs', async () => {
    mockFetchWithRetry.mockImplementation((url: RequestInfo) => {
      if ((url as string).includes('/comic/batch-slug-one')) {
        return Promise.resolve(makeResponse(makeDetailResponse({
          slug: 'batch-slug-one',
          hid: 'hid-one',
          status: 1,
          last_chapter: 50,
          md_comic_md_genres: [{ md_genres: { name: 'Action', group: 'Genre' } }],
        })))
      }
      if ((url as string).includes('/comic/batch-slug-two')) {
        return Promise.resolve(makeResponse(makeDetailResponse({
          slug: 'batch-slug-two',
          hid: 'hid-two',
          status: 2,
          last_chapter: 100,
          md_comic_md_genres: [],
        })))
      }
      return Promise.resolve(makeResponse({ error: 'Not found' }, 404))
    })

    const result = await fetchBatchComicKInfo(['batch-slug-one', 'batch-slug-two'])

    expect(result.size).toBe(2)
    expect(result.has('batch-slug-one')).toBe(true)
    expect(result.has('batch-slug-two')).toBe(true)

    const info1 = result.get('batch-slug-one')!
    expect(info1.slug).toBe('batch-slug-one')
    expect(info1.chapters).toBe(50)
    expect(info1.status).toBe('RELEASING') // mapComickStatus(1)
    expect(info1.genres).toContain('Action')

    const info2 = result.get('batch-slug-two')!
    expect(info2.chapters).toBe(100)
    expect(info2.status).toBe('FINISHED') // mapComickStatus(2)
  })

  it('handles partial failures gracefully', async () => {
    mockFetchWithRetry.mockImplementation((url: RequestInfo) => {
      if ((url as string).includes('/comic/partial-ok')) {
        return Promise.resolve(makeResponse(makeDetailResponse({
          slug: 'partial-ok',
          status: 1,
          last_chapter: 42,
          md_comic_md_genres: [],
        })))
      }
      // partial-fail returns 404
      return Promise.resolve(makeResponse({ error: 'Not found' }, 404))
    })

    const result = await fetchBatchComicKInfo(['partial-ok', 'partial-fail'])

    // Only successful fetch included
    expect(result.size).toBe(1)
    expect(result.has('partial-ok')).toBe(true)
    expect(result.has('partial-fail')).toBe(false)
  })

  it('maps status via mapComickStatus', async () => {
    // status 4 → HIATUS
    mockFetchWithRetry.mockResolvedValue(makeResponse(makeDetailResponse({
      slug: 'hiatus-manga',
      status: 4,
      md_comic_md_genres: [],
    })))

    const result = await fetchBatchComicKInfo(['hiatus-manga'])

    expect(result.get('hiatus-manga')!.status).toBe('HIATUS')
  })

  it('returns null chapters when last_chapter is null', async () => {
    mockFetchWithRetry.mockResolvedValue(makeResponse(makeDetailResponse({
      slug: 'no-chapters-slug',
      last_chapter: null,
      md_comic_md_genres: [],
    })))

    const result = await fetchBatchComicKInfo(['no-chapters-slug'])

    expect(result.get('no-chapters-slug')!.chapters).toBeNull()
  })
})
