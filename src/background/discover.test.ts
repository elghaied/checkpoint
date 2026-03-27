import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchTrending, computeForYou, clearDiscoverCaches } from './discover'

vi.mock('./retry', () => ({
  fetchWithRetry: vi.fn(),
}))

import { fetchWithRetry } from './retry'
const mockFetch = vi.mocked(fetchWithRetry)

function mockOkResponse(body: unknown): Response {
  return { ok: true, status: 200, json: () => Promise.resolve(body), text: () => Promise.resolve('') } as Response
}

beforeEach(() => {
  vi.clearAllMocks()
  clearDiscoverCaches()
})

describe('fetchTrending', () => {
  it('returns normalized discover items from /top endpoint', async () => {
    mockFetch.mockResolvedValue(mockOkResponse([
      { hid: 'h1', slug: 'test', title: 'Test', cover_url: 'https://img.jpg', country: 'kr', status: 1, last_chapter: 50, rating: '8.5', user_follow_count: 1000, md_titles: [{ title: 'Alt' }], genres: [1, 2] },
    ]))

    const results = await fetchTrending()

    expect(results).toHaveLength(1)
    expect(results[0].hid).toBe('h1')
    expect(results[0].title).toBe('Test')
    expect(results[0].followCount).toBe(1000)
    expect(results[0].altTitles).toEqual(['Alt'])
  })

  it('returns empty array on error', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))
    const results = await fetchTrending()
    expect(results).toEqual([])
  })

  it('includes tachiyomi=true in URL', async () => {
    mockFetch.mockResolvedValue(mockOkResponse([]))
    await fetchTrending()
    const url = mockFetch.mock.calls[0][0] as string
    expect(url).toContain('tachiyomi=true')
  })

  it('passes comic_types filter', async () => {
    mockFetch.mockResolvedValue(mockOkResponse([]))
    await fetchTrending(['manhwa', 'manga'])
    const url = mockFetch.mock.calls[0][0] as string
    expect(url).toContain('comic_types=manhwa')
    expect(url).toContain('comic_types=manga')
  })
})

describe('computeForYou', () => {
  it('returns empty array when no tracked items', async () => {
    const results = await computeForYou([], new Set())
    expect(results).toEqual([])
  })
})
