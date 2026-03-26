# ComicK API Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate ComicK as the primary manga data provider, with AniList and MangaDex as fallbacks, and silently migrate existing items.

**Architecture:** Provider adapter pattern. ComicK searched first, AniList/MangaDex fallback chain. Existing items get `comickSlug` cross-reference via silent migration so chapter checking uses ComicK for all matched items regardless of original provider. New items are saved with `provider: 'comick'`.

**Tech Stack:** TypeScript, Vite, Vitest, Chrome Extension Manifest V3, React 19

**Key design decisions:**
- Migration does NOT change `providerId` (the storage primary key). Instead it adds `comickHid`/`comickSlug` cross-reference fields. This avoids breaking custom list references and simplifies rollback. The chapter checker routes by `comickSlug` presence, not by `provider` field.
- The `anilistStatus` field is NOT renamed to `providerStatus` (deviating from spec). The field stores status from any provider and the name is historical. Renaming would require a storage data migration for all existing users and touch 8+ files for a purely cosmetic change. Not worth the risk.

---

## File Map

### New Files
| File | Responsibility |
|------|----------------|
| `src/background/comick.ts` | ComicK API client: search, detail fetch, batch chapter info |
| `src/background/comick.test.ts` | Tests for ComicK client |
| `src/background/migration.ts` | One-time silent migration to add ComicK cross-references |
| `src/background/migration.test.ts` | Tests for migration logic |

### Modified Files
| File | Changes |
|------|---------|
| `src/shared/types.ts` | Widen `provider` union, add `ComicKMedia`, add `comickHid`/`comickSlug`/`anilistId` to `TrackedItem` and `ExportedItem`, add `SEARCH_COMICK` message |
| `src/shared/constants.ts` | Add `COMICK_*` constants |
| `src/shared/utils.ts` | Add `getFormatFromCountry()`, `mapComickStatus()` |
| `src/shared/utils.test.ts` | Tests for new utils |
| `src/background/searchService.ts` | 3-provider chain, `normalizeComicKResults()`, `CloudflareBlockError` handling |
| `src/background/searchService.test.ts` | Update for 3-provider chain |
| `src/background/chapterChecker.ts` | Route by `comickSlug` presence, ComicK-first fallback |
| `src/background/genreBackfill.ts` | ComicK-first fallback, handle ComicK items |
| `src/background/index.ts` | Add `SEARCH_COMICK` handler, trigger migration |
| `src/sidepanel/hooks/useAddItem.ts` | Handle ComicK provider in `selectResult` |
| `src/sidepanel/services/messaging.ts` | Add `searchComicK()` wrapper |
| `src/storage/storageService.ts` | Add `comickSlug`/`comickHid`/`anilistId` to export, handle in import |
| `public/manifest.json` | Add ComicK cover CDN to CSP `img-src` |

---

## Task 1: Foundation — Types, Constants, Utilities

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/constants.ts`
- Modify: `src/shared/utils.ts`
- Modify: `src/shared/utils.test.ts`

### Types

- [ ] **Step 1: Add `ComicKMedia` interface and widen provider union in `types.ts`**

Add after the `MangaDexMedia` interface (line ~132):

```typescript
// ComicK media response (from search endpoint)
export interface ComicKMedia {
  hid: string
  slug: string
  title: string
  country: string              // 'jp', 'kr', 'cn'
  status: number               // 1=Ongoing, 2=Completed, 3=Cancelled, 4=Hiatus
  lastChapter: number | null   // from last_chapter, floored to int
  coverUrl: string             // pre-built URL from cover_url
  altTitles: string[]          // extracted from md_titles
  genres: string[]             // resolved genre names (empty from search, filled from detail)
}
```

Update `TrackedItem.provider` (line 12):

```typescript
provider: 'comick' | 'anilist' | 'mangadex'
```

Add new fields to `TrackedItem` after `genresBackfilled` (line ~39):

```typescript
  // ComicK cross-reference fields
  comickHid: string | null         // ComicK hid (stable unique ID)
  comickSlug: string | null        // ComicK slug (for API calls)
  anilistId: string | null         // AniList ID from ComicK links.al
```

Update `UnifiedSearchResult.provider` (line ~136):

```typescript
provider: 'comick' | 'anilist' | 'mangadex'
```

Update `UnifiedSearchResult.originalData` (line ~145):

```typescript
originalData: ComicKMedia | AniListMedia | MangaDexMedia
```

Add `SEARCH_COMICK` to `MessageRequest` union (after `SEARCH_MANGADEX` line ~186):

```typescript
| { type: 'SEARCH_COMICK'; query: string }
```

Add new fields to `ExportedItem` (after `genresBackfilled`, line ~76):

```typescript
  comickHid: string | null
  comickSlug: string | null
  anilistId: string | null
```

- [ ] **Step 2: Add ComicK constants to `constants.ts`**

Add at the end of the file:

```typescript
// ComicK API
export const COMICK_API_BASE = 'https://api.comick.dev'
export const COMICK_RATE_LIMIT_DELAY_MS = 300
export const COMICK_BATCH_SIZE = 5
export const MIGRATION_CONFIDENCE_THRESHOLD = 0.85
export const MIGRATION_STORAGE_KEY = 'comickMigrationComplete'
```

- [ ] **Step 3: Write failing tests for new utility functions**

Add to `src/shared/utils.test.ts`:

```typescript
import { cleanSearchQuery, getFormat, getFormatFromLanguage, getFormatFromCountry, mapComickStatus } from './utils'

// ... existing tests ...

describe('getFormatFromCountry', () => {
  it('returns MANGA for jp', () => {
    expect(getFormatFromCountry('jp')).toBe('MANGA')
  })

  it('returns MANHWA for kr', () => {
    expect(getFormatFromCountry('kr')).toBe('MANHWA')
  })

  it('returns MANHUA for cn', () => {
    expect(getFormatFromCountry('cn')).toBe('MANHUA')
  })

  it('returns MANHUA for tw', () => {
    expect(getFormatFromCountry('tw')).toBe('MANHUA')
  })

  it('returns MANGA for unknown country codes', () => {
    expect(getFormatFromCountry('us')).toBe('MANGA')
    expect(getFormatFromCountry('')).toBe('MANGA')
  })
})

describe('mapComickStatus', () => {
  it('maps 1 to RELEASING', () => {
    expect(mapComickStatus(1)).toBe('RELEASING')
  })

  it('maps 2 to FINISHED', () => {
    expect(mapComickStatus(2)).toBe('FINISHED')
  })

  it('maps 3 to CANCELLED', () => {
    expect(mapComickStatus(3)).toBe('CANCELLED')
  })

  it('maps 4 to HIATUS', () => {
    expect(mapComickStatus(4)).toBe('HIATUS')
  })

  it('returns null for unknown status', () => {
    expect(mapComickStatus(0)).toBeNull()
    expect(mapComickStatus(99)).toBeNull()
  })
})
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npm run test -- src/shared/utils.test.ts`
Expected: FAIL — `getFormatFromCountry` and `mapComickStatus` not exported

- [ ] **Step 5: Implement utility functions in `utils.ts`**

Add at the end of `src/shared/utils.ts`:

```typescript
/**
 * Derive format from ComicK's lowercase country code.
 * jp -> MANGA, kr -> MANHWA, cn/tw -> MANHUA
 */
export function getFormatFromCountry(country: string): MediaFormat {
  switch (country) {
    case 'kr':
      return 'MANHWA'
    case 'cn':
    case 'tw':
      return 'MANHUA'
    default:
      return 'MANGA'
  }
}

/**
 * Map ComicK's numeric status to the string status used internally.
 * 1=Ongoing→RELEASING, 2=Completed→FINISHED, 3=Cancelled→CANCELLED, 4=Hiatus→HIATUS
 */
export function mapComickStatus(status: number): string | null {
  switch (status) {
    case 1: return 'RELEASING'
    case 2: return 'FINISHED'
    case 3: return 'CANCELLED'
    case 4: return 'HIATUS'
    default: return null
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run test -- src/shared/utils.test.ts`
Expected: ALL PASS

- [ ] **Step 7: Run typecheck**

Run: `npm run typecheck`
Expected: Errors in files that reference `TrackedItem` without the new fields — this is expected and will be fixed in subsequent tasks.

- [ ] **Step 8: Commit**

```bash
git add src/shared/types.ts src/shared/constants.ts src/shared/utils.ts src/shared/utils.test.ts
git commit -m "feat(comick): add types, constants, and utility functions for ComicK integration"
```

---

## Task 2: ComicK API Client

**Files:**
- Create: `src/background/comick.ts`
- Create: `src/background/comick.test.ts`

- [ ] **Step 1: Write failing tests for ComicK API client**

Create `src/background/comick.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { searchComicK, fetchComicDetail, fetchBatchComicKInfo } from './comick'
import type { ComicKMedia } from '@/shared/types'

// Mock fetchWithRetry
vi.mock('./retry', () => ({
  fetchWithRetry: vi.fn(),
}))

import { fetchWithRetry } from './retry'
const mockFetch = vi.mocked(fetchWithRetry)

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSearchResponse(comics: Array<{
  hid?: string
  slug?: string
  title?: string
  country?: string
  status?: number
  last_chapter?: number | null
  cover_url?: string
  md_titles?: Array<{ title: string }>
}>) {
  return comics.map((c) => ({
    hid: c.hid ?? 'abc123',
    slug: c.slug ?? 'test-manga',
    title: c.title ?? 'Test Manga',
    country: c.country ?? 'jp',
    status: c.status ?? 1,
    last_chapter: c.last_chapter ?? 100,
    cover_url: c.cover_url ?? 'https://meo.comick.pictures/test-s.jpg',
    md_titles: c.md_titles ?? [],
    genres: [],
  }))
}

function makeDetailResponse(overrides: Record<string, unknown> = {}) {
  return {
    comic: {
      hid: 'abc123',
      slug: 'test-manga',
      title: 'Test Manga',
      country: 'jp',
      status: 1,
      last_chapter: 100,
      cover_url: 'https://meo.comick.pictures/test-s.jpg',
      md_titles: [],
      md_comic_md_genres: [
        { md_genres: { name: 'Action', slug: 'action', group: 'Genre' } },
        { md_genres: { name: 'Fantasy', slug: 'fantasy', group: 'Genre' } },
      ],
      links: { al: '12345', mal: '67890' },
      ...overrides,
    },
  }
}

function mockOkResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response
}

function mockErrorResponse(status: number): Response {
  return {
    ok: false,
    status,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve('error'),
  } as Response
}

// ---------------------------------------------------------------------------
// searchComicK
// ---------------------------------------------------------------------------

describe('searchComicK', () => {
  it('returns normalized results from search endpoint', async () => {
    mockFetch.mockResolvedValue(mockOkResponse(makeSearchResponse([
      { hid: 'h1', slug: 'solo-leveling', title: 'Solo Leveling', country: 'kr', status: 2, last_chapter: 200.5 },
    ])))

    const results = await searchComicK('Solo Leveling')

    expect(results).toHaveLength(1)
    expect(results[0].hid).toBe('h1')
    expect(results[0].slug).toBe('solo-leveling')
    expect(results[0].title).toBe('Solo Leveling')
    expect(results[0].country).toBe('kr')
    expect(results[0].lastChapter).toBe(200) // floored from 200.5
  })

  it('includes tachiyomi=true in request URL', async () => {
    mockFetch.mockResolvedValue(mockOkResponse([]))

    await searchComicK('test')

    const calledUrl = mockFetch.mock.calls[0][0] as string
    expect(calledUrl).toContain('tachiyomi=true')
  })

  it('extracts alt titles from md_titles', async () => {
    mockFetch.mockResolvedValue(mockOkResponse(makeSearchResponse([
      { md_titles: [{ title: 'Alt Title 1' }, { title: 'Alt Title 2' }] },
    ])))

    const results = await searchComicK('test')

    expect(results[0].altTitles).toEqual(['Alt Title 1', 'Alt Title 2'])
  })

  it('returns empty array on network error', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))

    const results = await searchComicK('test')

    expect(results).toEqual([])
  })

  it('throws CloudflareBlockError on 403', async () => {
    mockFetch.mockResolvedValue(mockErrorResponse(403))

    await expect(searchComicK('test')).rejects.toThrow('CloudflareBlockError')
  })

  it('throws CloudflareBlockError on 503', async () => {
    mockFetch.mockResolvedValue(mockErrorResponse(503))

    await expect(searchComicK('test')).rejects.toThrow('CloudflareBlockError')
  })

  it('returns empty array on other HTTP errors', async () => {
    mockFetch.mockResolvedValue(mockErrorResponse(500))

    const results = await searchComicK('test')

    expect(results).toEqual([])
  })

  it('handles null last_chapter', async () => {
    mockFetch.mockResolvedValue(mockOkResponse(makeSearchResponse([
      { last_chapter: null },
    ])))

    const results = await searchComicK('test')

    expect(results[0].lastChapter).toBeNull()
  })

  it('uses cache for repeated queries', async () => {
    mockFetch.mockResolvedValue(mockOkResponse(makeSearchResponse([{ title: 'Cached' }])))

    await searchComicK('cache test')
    await searchComicK('cache test')

    expect(mockFetch).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// fetchComicDetail
// ---------------------------------------------------------------------------

describe('fetchComicDetail', () => {
  it('returns comic detail with links and genres', async () => {
    mockFetch.mockResolvedValue(mockOkResponse(makeDetailResponse()))

    const detail = await fetchComicDetail('test-manga')

    expect(detail).not.toBeNull()
    expect(detail!.hid).toBe('abc123')
    expect(detail!.links.anilistId).toBe('12345')
    expect(detail!.links.malId).toBe('67890')
    expect(detail!.genres).toEqual(['Action', 'Fantasy'])
  })

  it('returns null on error', async () => {
    mockFetch.mockResolvedValue(mockErrorResponse(404))

    const detail = await fetchComicDetail('nonexistent')

    expect(detail).toBeNull()
  })

  it('handles missing links gracefully', async () => {
    mockFetch.mockResolvedValue(mockOkResponse(makeDetailResponse({ links: {} })))

    const detail = await fetchComicDetail('test-manga')

    expect(detail!.links.anilistId).toBeUndefined()
    expect(detail!.links.malId).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// fetchBatchComicKInfo
// ---------------------------------------------------------------------------

describe('fetchBatchComicKInfo', () => {
  it('fetches chapter info for multiple slugs', async () => {
    mockFetch
      .mockResolvedValueOnce(mockOkResponse(makeDetailResponse({ last_chapter: 100, status: 1 })))
      .mockResolvedValueOnce(mockOkResponse(makeDetailResponse({ last_chapter: 50, status: 2 })))

    const results = await fetchBatchComicKInfo(['manga-1', 'manga-2'])

    expect(results.size).toBe(2)
  })

  it('returns empty map for empty input', async () => {
    const results = await fetchBatchComicKInfo([])

    expect(results.size).toBe(0)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('handles partial failures gracefully', async () => {
    mockFetch
      .mockResolvedValueOnce(mockOkResponse(makeDetailResponse({ last_chapter: 100 })))
      .mockRejectedValueOnce(new Error('Network error'))

    const results = await fetchBatchComicKInfo(['manga-1', 'manga-2'])

    expect(results.size).toBe(1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/background/comick.test.ts`
Expected: FAIL — module `./comick` not found

- [ ] **Step 3: Implement ComicK API client**

Create `src/background/comick.ts`:

```typescript
import type { ComicKMedia } from '@/shared/types'
import { COMICK_API_BASE, SEARCH_RESULTS_PER_PAGE, COMICK_BATCH_SIZE, COMICK_RATE_LIMIT_DELAY_MS } from '@/shared/constants'
import { fetchWithRetry } from './retry'
import { createLogger } from '@/shared/logger'
import { TTLCache } from './cache'
import { mapComickStatus } from '@/shared/utils'

const log = createLogger('comick')
const searchCache = new TTLCache<ComicKMedia[]>(5 * 60 * 1000)

// ---------------------------------------------------------------------------
// Cloudflare error
// ---------------------------------------------------------------------------

export class CloudflareBlockError extends Error {
  constructor(status: number) {
    super(`CloudflareBlockError: ComicK returned ${status}`)
    this.name = 'CloudflareBlockError'
  }
}

// ---------------------------------------------------------------------------
// Shared fetch wrapper
// ---------------------------------------------------------------------------

const COMICK_HEADERS: Record<string, string> = {
  'Accept': 'application/json',
  'Referer': 'https://comick.io/',
}

function buildUrl(path: string, params: Record<string, string> = {}): string {
  const url = new URL(`${COMICK_API_BASE}${path}`)
  url.searchParams.set('tachiyomi', 'true')
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }
  return url.toString()
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

interface ComicKSearchItem {
  hid: string
  slug: string
  title: string
  country: string
  status: number
  last_chapter: number | null
  cover_url: string
  md_titles: Array<{ title: string }>
  genres: number[]
}

/**
 * Search ComicK for manga matching the given query.
 * Throws CloudflareBlockError on 403/503 so callers can fall through to AniList.
 */
export async function searchComicK(query: string): Promise<ComicKMedia[]> {
  const cacheKey = query.toLowerCase().trim()
  const cached = searchCache.get(cacheKey)
  if (cached) {
    log.debug('Cache hit for:', cacheKey)
    return cached
  }

  log.debug('Searching for:', query)

  const url = buildUrl('/v1.0/search/', {
    q: query,
    limit: String(SEARCH_RESULTS_PER_PAGE),
    t: 'true', // include alt titles
  })

  let response: Response

  try {
    response = await fetchWithRetry(url, { headers: COMICK_HEADERS })
  } catch (err) {
    log.error('Network error during search:', err)
    return []
  }

  if (response.status === 403 || response.status === 503) {
    throw new CloudflareBlockError(response.status)
  }

  if (!response.ok) {
    log.error('ComicK returned HTTP', response.status)
    return []
  }

  const json: ComicKSearchItem[] = await response.json()

  const results: ComicKMedia[] = json.map((item) => ({
    hid: item.hid,
    slug: item.slug,
    title: item.title,
    country: item.country,
    status: item.status,
    lastChapter: item.last_chapter != null ? Math.floor(item.last_chapter) : null,
    coverUrl: item.cover_url || '',
    altTitles: (item.md_titles ?? []).map((t) => t.title),
    genres: [], // genre IDs only in search; resolved from detail endpoint
  }))

  log.debug('Found', results.length, 'results')
  searchCache.set(cacheKey, results)
  return results
}

// ---------------------------------------------------------------------------
// Comic detail
// ---------------------------------------------------------------------------

interface ComicKDetailResponse {
  comic: {
    hid: string
    slug: string
    title: string
    country: string
    status: number
    last_chapter: number | null
    cover_url: string
    md_titles: Array<{ title: string }>
    md_comic_md_genres?: Array<{
      md_genres: { name: string; slug: string; group: string }
    }>
    links?: Record<string, string>
  }
}

export interface ComicKDetail {
  hid: string
  slug: string
  title: string
  country: string
  status: number
  lastChapter: number | null
  coverUrl: string
  altTitles: string[]
  genres: string[]
  links: {
    anilistId?: string
    malId?: string
  }
}

/**
 * Fetch full comic detail including cross-provider links and genre names.
 * Returns null on error.
 */
export async function fetchComicDetail(slug: string): Promise<ComicKDetail | null> {
  const url = buildUrl(`/comic/${slug}/`)

  try {
    const response = await fetchWithRetry(url, { headers: COMICK_HEADERS })

    if (!response.ok) {
      log.error('Detail fetch failed for', slug, ':', response.status)
      return null
    }

    const json: ComicKDetailResponse = await response.json()
    const comic = json.comic

    const genres = (comic.md_comic_md_genres ?? [])
      .filter((g) => g.md_genres.group === 'Genre' || g.md_genres.group === 'Theme')
      .map((g) => g.md_genres.name)

    return {
      hid: comic.hid,
      slug: comic.slug,
      title: comic.title,
      country: comic.country,
      status: comic.status,
      lastChapter: comic.last_chapter != null ? Math.floor(comic.last_chapter) : null,
      coverUrl: comic.cover_url || '',
      altTitles: (comic.md_titles ?? []).map((t) => t.title),
      genres,
      links: {
        anilistId: comic.links?.al,
        malId: comic.links?.mal,
      },
    }
  } catch (err) {
    log.error('Error fetching detail for', slug, ':', err)
    return null
  }
}

// ---------------------------------------------------------------------------
// Batch chapter info
// ---------------------------------------------------------------------------

export interface ComicKChapterResult {
  slug: string
  status: string | null
  chapters: number | null
  genres: string[]
}

/**
 * Fetch chapter info for multiple comics by slug.
 * No batch endpoint exists — fetches individually with rate limiting.
 */
export async function fetchBatchComicKInfo(
  slugs: string[]
): Promise<Map<string, ComicKChapterResult>> {
  const results = new Map<string, ComicKChapterResult>()

  if (slugs.length === 0) return results

  log.debug('Fetching chapter info for', slugs.length, 'ComicK items')

  for (let i = 0; i < slugs.length; i += COMICK_BATCH_SIZE) {
    const batch = slugs.slice(i, i + COMICK_BATCH_SIZE)

    const batchResults = await Promise.allSettled(
      batch.map((slug) => fetchComicDetail(slug))
    )

    for (let j = 0; j < batchResults.length; j++) {
      const result = batchResults[j]
      if (result.status === 'fulfilled' && result.value) {
        const detail = result.value
        results.set(batch[j], {
          slug: detail.slug,
          status: mapComickStatus(detail.status),
          chapters: detail.lastChapter,
          genres: detail.genres,
        })
      }
    }

    if (i + COMICK_BATCH_SIZE < slugs.length) {
      await new Promise((resolve) => setTimeout(resolve, COMICK_RATE_LIMIT_DELAY_MS))
    }
  }

  log.debug('Fetched info for', results.size, 'items')
  return results
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/background/comick.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/background/comick.ts src/background/comick.test.ts
git commit -m "feat(comick): add ComicK API client with search, detail, and batch endpoints"
```

---

## Task 3: Update Search Service for 3-Provider Chain

**Files:**
- Modify: `src/background/searchService.ts`
- Modify: `src/background/searchService.test.ts`

- [ ] **Step 1: Write new tests for ComicK-first search chain**

Add to `src/background/searchService.test.ts`:

Add mock for comick module alongside existing mocks:

```typescript
import { searchComicK, CloudflareBlockError } from './comick'
import type { ComicKMedia } from '@/shared/types'

vi.mock('./comick', () => ({
  searchComicK: vi.fn(),
  CloudflareBlockError: class CloudflareBlockError extends Error {
    constructor(status: number) {
      super(`CloudflareBlockError: ComicK returned ${status}`)
      this.name = 'CloudflareBlockError'
    }
  },
}))

const mockSearchComicK = vi.mocked(searchComicK)
```

Add helper:

```typescript
function makeComicKMedia(
  hid: string,
  title: string,
  altTitles: string[] = [],
  country = 'jp',
): ComicKMedia {
  return {
    hid,
    slug: hid + '-slug',
    title,
    country,
    status: 1,
    lastChapter: 100,
    coverUrl: `https://meo.comick.pictures/${hid}-s.jpg`,
    altTitles,
    genres: [],
  }
}
```

Add to `beforeEach`:

```typescript
mockSearchComicK.mockResolvedValue([])
```

Add new describe blocks:

```typescript
describe('ComicK as primary provider', () => {
  it('returns ComicK results when above threshold', async () => {
    mockSearchComicK.mockResolvedValue([makeComicKMedia('h1', 'Solo Leveling', [], 'kr')])

    const results = await searchWithFallback('Solo Leveling', 'Solo Leveling')

    expect(results).toHaveLength(1)
    expect(results[0].provider).toBe('comick')
    expect(mockSearchAniList).not.toHaveBeenCalled()
    expect(mockSearchMangaDex).not.toHaveBeenCalled()
  })

  it('falls through to AniList when ComicK returns empty', async () => {
    mockSearchComicK.mockResolvedValue([])
    mockSearchAniList.mockResolvedValue([makeAniListMedia(1, 'Solo Leveling')])

    const results = await searchWithFallback('Solo Leveling', 'Solo Leveling')

    expect(results[0].provider).toBe('anilist')
  })

  it('falls through to AniList on CloudflareBlockError', async () => {
    mockSearchComicK.mockRejectedValue(new CloudflareBlockError(403))
    mockSearchAniList.mockResolvedValue([makeAniListMedia(1, 'Solo Leveling')])

    const results = await searchWithFallback('Solo Leveling', 'Solo Leveling')

    expect(results[0].provider).toBe('anilist')
  })

  it('falls through to MangaDex when both ComicK and AniList return empty', async () => {
    mockSearchComicK.mockResolvedValue([])
    mockSearchAniList.mockResolvedValue([])
    mockSearchMangaDex.mockResolvedValue([makeMangaDexMedia('mdx-1', 'Solo Leveling')])

    const results = await searchWithFallback('Solo Leveling', 'Solo Leveling')

    expect(results[0].provider).toBe('mangadex')
  })

  it('normalizes ComicK result into UnifiedSearchResult shape', async () => {
    mockSearchComicK.mockResolvedValue([
      makeComicKMedia('h1', 'Solo Leveling', ['Only I Level Up'], 'kr'),
    ])

    const results = await searchWithFallback('Solo Leveling', 'Solo Leveling')
    const result = results[0]

    expect(result.provider).toBe('comick')
    expect(result.id).toBe('h1')
    expect(result.title.primary).toBe('Solo Leveling')
    expect(result.title.alt).toContain('Only I Level Up')
    expect(result.format).toBe('MANHWA')
    expect(result.chapters).toBe(100)
    expect(result.confidence).toBe(1.0)
  })
})
```

- [ ] **Step 2: Run tests to verify new tests fail**

Run: `npm run test -- src/background/searchService.test.ts`
Expected: FAIL — `normalizeComicKResults` not implemented, search chain still AniList-first

- [ ] **Step 3: Update `searchService.ts` with 3-provider chain**

Replace the full file content of `src/background/searchService.ts`:

```typescript
import type { AniListMedia, MangaDexMedia, ComicKMedia, UnifiedSearchResult } from '@/shared/types'
import { cleanSearchQuery, getFormat, getFormatFromLanguage, getFormatFromCountry, mapComickStatus } from '@/shared/utils'
import { searchAniList, collectTitles, normalise, scorePair } from './anilist'
import { searchMangaDex } from './mangadex'
import { searchComicK, CloudflareBlockError } from './comick'
import { CONFIDENCE_THRESHOLD, MAX_LOW_CONFIDENCE_RESULTS } from '@/shared/constants'
import { createLogger } from '@/shared/logger'

const log = createLogger('search')

/**
 * Calculate the best confidence score for a set of titles against an extracted title.
 */
function calculateConfidence(extractedTitle: string, titles: string[]): number {
  const normExtracted = normalise(extractedTitle)
  let best = 0

  for (const t of titles) {
    const score = scorePair(normExtracted, normalise(t))
    if (score > best) best = score
  }

  return best
}

/**
 * Convert ComicK results to unified format with confidence scores.
 */
function normalizeComicKResults(
  results: ComicKMedia[],
  extractedTitle: string
): UnifiedSearchResult[] {
  return results.map((media) => {
    const allTitles = [media.title, ...media.altTitles]
    const confidence = calculateConfidence(extractedTitle, allTitles)

    return {
      provider: 'comick' as const,
      id: media.hid,
      title: {
        primary: media.title,
        alt: media.altTitles,
      },
      coverUrl: media.coverUrl,
      format: getFormatFromCountry(media.country),
      status: mapComickStatus(media.status),
      chapters: media.lastChapter,
      genres: media.genres,
      confidence,
      originalData: media,
    }
  })
}

/**
 * Convert AniList results to unified format with confidence scores.
 */
function normalizeAniListResults(
  results: AniListMedia[],
  extractedTitle: string
): UnifiedSearchResult[] {
  return results.map((media) => {
    const titles = collectTitles(media)
    const confidence = calculateConfidence(extractedTitle, titles)

    return {
      provider: 'anilist' as const,
      id: String(media.id),
      title: {
        primary: media.title.english || media.title.romaji,
        alt: titles,
      },
      coverUrl: media.coverImage.large || media.coverImage.medium,
      format: getFormat(media.countryOfOrigin),
      status: media.status,
      chapters: media.chapters,
      genres: media.genres ?? [],
      confidence,
      originalData: media,
    }
  })
}

/**
 * Convert MangaDex results to unified format with confidence scores.
 */
function normalizeMangaDexResults(
  results: MangaDexMedia[],
  extractedTitle: string
): UnifiedSearchResult[] {
  return results.map((manga) => {
    const allTitles = [manga.title, ...manga.altTitles]
    const confidence = calculateConfidence(extractedTitle, allTitles)

    const chapters = manga.lastChapter ? parseInt(manga.lastChapter, 10) : null

    return {
      provider: 'mangadex' as const,
      id: manga.id,
      title: {
        primary: manga.title,
        alt: manga.altTitles,
      },
      coverUrl: manga.coverUrl,
      format: getFormatFromLanguage(manga.originalLanguage),
      status: manga.status,
      chapters: isNaN(chapters as number) ? null : chapters,
      genres: manga.genres ?? [],
      confidence,
      originalData: manga,
    }
  })
}

/**
 * Try a provider's results: return above-threshold sorted, or null if none qualify.
 */
function tryProvider(normalized: UnifiedSearchResult[]): UnifiedSearchResult[] | null {
  const valid = normalized.filter((r) => r.confidence >= CONFIDENCE_THRESHOLD)
  if (valid.length > 0) {
    return valid.sort((a, b) => b.confidence - a.confidence)
  }
  return null
}

/**
 * Search with fallback: ComicK first, then AniList, then MangaDex.
 * Returns results that meet the confidence threshold from the first provider that matches.
 */
export async function searchWithFallback(
  query: string,
  extractedTitle: string
): Promise<UnifiedSearchResult[]> {
  const searchQuery = cleanSearchQuery(extractedTitle || query) || cleanSearchQuery(query) || query
  log.info('Searching with fallback for:', searchQuery, '(original:', query, ', extracted:', extractedTitle, ')')

  const cleanedExtractedTitle = cleanSearchQuery(extractedTitle) || extractedTitle

  // Collect low-confidence results from each provider as fallback
  let bestLowConfidence: UnifiedSearchResult[] = []

  // 1. Try ComicK (primary)
  try {
    const comickResults = await searchComicK(searchQuery)
    const normalizedComick = normalizeComicKResults(comickResults, cleanedExtractedTitle)

    log.debug('ComicK:', comickResults.length, 'total')

    const validComick = tryProvider(normalizedComick)
    if (validComick) return validComick

    if (normalizedComick.length > 0) {
      bestLowConfidence = normalizedComick
    }
  } catch (err) {
    if (err instanceof CloudflareBlockError) {
      log.info('ComicK blocked by Cloudflare, falling through to AniList')
    } else {
      log.error('ComicK search error:', err)
    }
  }

  // 2. Try AniList (fallback 1)
  const anilistResults = await searchAniList(searchQuery)
  const normalizedAnilist = normalizeAniListResults(anilistResults, cleanedExtractedTitle)

  log.debug('AniList:', anilistResults.length, 'total')

  const validAnilist = tryProvider(normalizedAnilist)
  if (validAnilist) return validAnilist

  if (normalizedAnilist.length > 0 && bestLowConfidence.length === 0) {
    bestLowConfidence = normalizedAnilist
  }

  // 3. Try MangaDex (fallback 2)
  log.info('AniList had no valid matches, trying MangaDex')
  const mangadexResults = await searchMangaDex(searchQuery)
  const normalizedMangadex = normalizeMangaDexResults(mangadexResults, cleanedExtractedTitle)

  log.debug('MangaDex:', mangadexResults.length, 'total')

  const validMangadex = tryProvider(normalizedMangadex)
  if (validMangadex) return validMangadex

  if (normalizedMangadex.length > 0 && bestLowConfidence.length === 0) {
    bestLowConfidence = normalizedMangadex
  }

  // No provider had confident results — return top 5 low-confidence from best provider
  if (bestLowConfidence.length > 0) {
    log.info('No valid matches from any provider, returning top low-confidence results')
    return bestLowConfidence
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, MAX_LOW_CONFIDENCE_RESULTS)
  }

  return []
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/background/searchService.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/background/searchService.ts src/background/searchService.test.ts
git commit -m "feat(comick): update search service with ComicK-first 3-provider chain"
```

---

## Task 4: Update Manifest and CSP

**Files:**
- Modify: `public/manifest.json`

- [ ] **Step 1: Add ComicK cover CDN to CSP img-src**

In `public/manifest.json`, update the `content_security_policy` to include the ComicK cover image CDN:

```json
"content_security_policy": {
  "extension_pages": "script-src 'self'; object-src 'self'; img-src 'self' https://s4.anilist.co https://uploads.mangadex.org https://meo.comick.pictures"
}
```

Note: `host_permissions` already includes `"https://*/*"` which covers `api.comick.dev`.

- [ ] **Step 2: Commit**

```bash
git add public/manifest.json
git commit -m "feat(comick): add ComicK cover CDN to CSP img-src"
```

---

## Task 5: UI Integration — useAddItem, Messaging, Background Router

**Files:**
- Modify: `src/sidepanel/hooks/useAddItem.ts`
- Modify: `src/sidepanel/services/messaging.ts`
- Modify: `src/background/index.ts`

- [ ] **Step 1: Add `searchComicK` to messaging service**

Add to `src/sidepanel/services/messaging.ts` after the `searchManga` function (line ~48), and add `ComicKMedia` to the imports:

```typescript
import type {
  MessageRequest,
  MessageResponse,
  PageMetadata,
  TrackedItem,
  AniListMedia,
  ComicKMedia,
  ExtensionSettings,
  ExportedData,
  UnifiedSearchResult,
  ImportResult,
  CustomTagRegistry,
  CustomList,
} from '@/shared/types'

// ... existing code ...

/**
 * Search ComicK directly
 */
export async function searchComicK(query: string): Promise<ComicKMedia[]> {
  return sendMessage<ComicKMedia[]>({ type: 'SEARCH_COMICK', query })
}
```

- [ ] **Step 2: Update `useAddItem.ts` to handle ComicK provider**

In `src/sidepanel/hooks/useAddItem.ts`, update the `selectResult` function.

Update imports (line 2):

```typescript
import type { TrackedItem, AniListMedia, ComicKMedia, PageMetadata, UnifiedSearchResult } from '@/shared/types'
```

Replace the provider-specific status extraction block (lines 121-125) and the item construction (lines 127-153):

```typescript
      // Extract status from the unified result (works for all providers)
      const providerStatus = result.status

      // Extract ComicK cross-reference fields if available
      let comickHid: string | null = null
      let comickSlug: string | null = null
      let anilistIdRef: string | null = null

      if (result.provider === 'comick') {
        const comickData = result.originalData as ComicKMedia
        comickHid = comickData.hid
        comickSlug = comickData.slug
      }

      const item: TrackedItem = {
        provider: result.provider,
        providerId: result.id,
        mediaType: 'manga',
        format: result.format,
        titles: {
          main: result.title.primary,
          alt: altTitles,
        },
        coverImage: result.coverUrl,
        progress: {
          unit: 'chapter',
          value: meta.chapterNumber || '0',
        },
        lastUrl: meta.pageUrl,
        updatedAt: now,
        createdAt: now,
        chaptersWhenAdded: result.chapters,
        latestKnownChapters: result.chapters,
        lastApiCheck: now,
        notificationsEnabled: false,
        anilistStatus: providerStatus,
        genres: result.genres ?? [],
        tags: [],
        genresBackfilled: result.genres.length > 0,
        comickHid,
        comickSlug,
        anilistId: anilistIdRef,
      }
```

- [ ] **Step 3: Add `SEARCH_COMICK` handler to background router**

In `src/background/index.ts`, add the import for `searchComicK` (line ~3):

```typescript
import { searchComicK } from './comick'
```

Add the handler after the `SEARCH_MANGADEX` case (line ~129):

```typescript
    case 'SEARCH_COMICK': {
      log.debug('SEARCH_COMICK:', message.query)
      const results = await searchComicK(message.query)
      log.debug('SEARCH_COMICK results:', results.length)
      return results
    }
```

- [ ] **Step 4: Run typecheck to verify integration**

Run: `npm run typecheck`
Expected: May have errors from files not yet updated (chapterChecker, genreBackfill, storageService) — these are expected.

- [ ] **Step 5: Commit**

```bash
git add src/sidepanel/hooks/useAddItem.ts src/sidepanel/services/messaging.ts src/background/index.ts
git commit -m "feat(comick): integrate ComicK into UI, messaging, and background router"
```

---

## Task 6: Update Chapter Checker

**Files:**
- Modify: `src/background/chapterChecker.ts`

- [ ] **Step 1: Update chapter checker to route by `comickSlug` presence**

Replace the full content of `src/background/chapterChecker.ts`:

```typescript
import { storageService } from '@/storage'
import { fetchBatchChapterInfo } from './anilist'
import { fetchBatchMangaDexInfo, searchMangaDex } from './mangadex'
import { fetchBatchComicKInfo, searchComicK } from './comick'
import { showNewChaptersNotification, showBatchNotification } from './notifications'
import { mapComickStatus } from '@/shared/utils'
import type { TrackedItem } from '@/shared/types'
import { CHAPTER_CHECK_ALARM_NAME, CHAPTER_CHECK_INITIAL_DELAY_MIN } from '@/shared/constants'
import { createLogger } from '@/shared/logger'
import { importActive } from './state'

const log = createLogger('chapters')

/**
 * Search ComicK by title to get chapter info as fallback.
 */
async function getComicKChaptersByTitle(title: string): Promise<number | null> {
  try {
    const results = await searchComicK(title)
    if (results.length === 0) return null
    return results[0].lastChapter
  } catch {
    return null
  }
}

/**
 * Search MangaDex by title to get chapter info as fallback.
 */
async function getMangaDexChaptersByTitle(title: string): Promise<number | null> {
  try {
    const results = await searchMangaDex(title)
    if (results.length === 0) return null

    const best = results[0]
    if (!best.lastChapter) return null

    const chapters = parseInt(best.lastChapter, 10)
    return isNaN(chapters) ? null : chapters
  } catch (err) {
    log.error('MangaDex fallback search failed for', title, ':', err)
    return null
  }
}

/**
 * Set up the alarm for periodic chapter checking.
 */
export async function setupChapterCheckAlarm(): Promise<void> {
  const settings = await storageService.getSettings()

  await chrome.alarms.clear(CHAPTER_CHECK_ALARM_NAME)

  chrome.alarms.create(CHAPTER_CHECK_ALARM_NAME, {
    delayInMinutes: CHAPTER_CHECK_INITIAL_DELAY_MIN,
    periodInMinutes: settings.checkIntervalMinutes,
  })

  log.info('Alarm set up with interval:', settings.checkIntervalMinutes, 'minutes')
}

/**
 * Handle the alarm event - check for chapter updates.
 */
export async function handleChapterCheckAlarm(): Promise<void> {
  if (importActive) {
    log.info('Skipping chapter check — CSV import is active')
    return
  }
  log.info('Running chapter check...')

  const settings = await storageService.getSettings()

  if (!settings.globalNotificationsEnabled) {
    log.debug('Global notifications disabled, skipping check')
    return
  }

  const items = await storageService.getItemsForUpdate()

  if (items.length === 0) {
    log.debug('No items to check')
    return
  }

  log.info('Checking', items.length, 'items')

  // Route by ComicK cross-reference availability, then by original provider
  const comickItems = items.filter((item) => item.comickSlug)
  const anilistOnly = items.filter((item) => !item.comickSlug && item.provider === 'anilist')
  const mangadexOnly = items.filter((item) => !item.comickSlug && item.provider === 'mangadex')

  const comickSlugs = comickItems.map((item) => item.comickSlug!)
  const anilistIds = anilistOnly.map((item) => item.providerId)
  const mangadexIds = mangadexOnly.map((item) => item.providerId)

  const [comickInfo, anilistInfo, mangadexInfo] = await Promise.all([
    comickSlugs.length > 0 ? fetchBatchComicKInfo(comickSlugs) : new Map(),
    anilistIds.length > 0 ? fetchBatchChapterInfo(anilistIds) : new Map(),
    mangadexIds.length > 0 ? fetchBatchMangaDexInfo(mangadexIds) : new Map(),
  ])

  // Find AniList items with null chapters — try ComicK first, then MangaDex
  const anilistNullChapterItems = anilistOnly.filter((item) => {
    const info = anilistInfo.get(item.providerId)
    return info && info.chapters === null
  })

  const fallbackChapters = new Map<string, number | null>()
  if (anilistNullChapterItems.length > 0) {
    log.debug('Fetching ComicK/MangaDex fallback for', anilistNullChapterItems.length, 'items with null AniList chapters')

    const BATCH_SIZE = 5
    const BATCH_DELAY = 1100

    for (let i = 0; i < anilistNullChapterItems.length; i += BATCH_SIZE) {
      const batch = anilistNullChapterItems.slice(i, i + BATCH_SIZE)
      const batchResults = await Promise.allSettled(
        batch.map(async (item) => {
          // Try ComicK first (faster, usually has data)
          const comickChapters = await getComicKChaptersByTitle(item.titles.main)
          if (comickChapters !== null) return comickChapters
          // Fall back to MangaDex
          return getMangaDexChaptersByTitle(item.titles.main)
        })
      )

      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j]
        if (result.status === 'fulfilled') {
          fallbackChapters.set(batch[j].providerId, result.value)
        }
      }

      if (i + BATCH_SIZE < anilistNullChapterItems.length) {
        await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY))
      }
    }
  }

  // Merge into common format: providerId -> { status, chapters, source }
  const chapterInfo = new Map<string, { status: string | null; chapters: number | null; source: string }>()
  const itemsWithNoData: TrackedItem[] = []

  // ComicK items (keyed by comickSlug, need to map back to providerId)
  for (const item of comickItems) {
    const info = comickInfo.get(item.comickSlug!)
    if (info) {
      chapterInfo.set(item.providerId, { status: info.status, chapters: info.chapters, source: 'comick' })
    } else {
      itemsWithNoData.push(item)
    }
  }

  // AniList-only items
  for (const [id, info] of anilistInfo) {
    let chapters = info.chapters
    let source = 'anilist'

    if (chapters === null && fallbackChapters.has(id)) {
      chapters = fallbackChapters.get(id) ?? null
      source = chapters !== null ? 'comick-fallback' : 'none'
    }

    chapterInfo.set(id, { status: info.status, chapters, source })

    if (chapters === null) {
      const item = anilistOnly.find((i) => i.providerId === id)
      if (item) itemsWithNoData.push(item)
    }
  }

  // MangaDex-only items
  for (const [id, info] of mangadexInfo) {
    const chapters = info.lastChapter
    chapterInfo.set(id, { status: info.status, chapters, source: 'mangadex' })

    if (chapters === null) {
      const item = mangadexOnly.find((i) => i.providerId === id)
      if (item) itemsWithNoData.push(item)
    }
  }

  if (itemsWithNoData.length > 0) {
    log.debug('No chapter data available from any provider for:')
    for (const item of itemsWithNoData) {
      log.debug(`  - ${item.titles.main} (${item.provider})`)
    }
  }

  // Process updates and collect notifications
  const updates: Array<{
    providerId: string
    latestKnownChapters: number | null
    anilistStatus: string | null
    lastApiCheck: number
  }> = []

  const itemsWithNewChapters: Array<{
    title: string
    chaptersAhead: number
    coverImage: string
    providerId: string
  }> = []

  const now = Date.now()

  for (const item of items) {
    const info = chapterInfo.get(item.providerId)

    if (!info) {
      log.debug('No info found for', item.titles.main, '(provider:', item.provider, ')')
      continue
    }

    const previousChapters = item.latestKnownChapters
    const newChapters = info.chapters

    updates.push({
      providerId: item.providerId,
      latestKnownChapters: newChapters,
      anilistStatus: info.status,
      lastApiCheck: now,
    })

    if (newChapters !== null && previousChapters !== null && newChapters > previousChapters) {
      const chaptersWhenAdded = item.chaptersWhenAdded ?? 0

      if (settings.notifyOnlyNewReleases && newChapters <= chaptersWhenAdded) {
        log.debug('Skipping notification for', item.titles.main, '- chapters not beyond baseline')
        continue
      }

      const chaptersAhead = newChapters - (previousChapters ?? 0)

      log.info('New chapters for', item.titles.main, ':', previousChapters, '->', newChapters)

      itemsWithNewChapters.push({
        title: item.titles.main,
        chaptersAhead,
        coverImage: item.coverImage,
        providerId: item.providerId,
      })
    }
  }

  if (updates.length > 0) {
    await storageService.bulkUpdateChapterInfo(updates)
    log.debug('Updated chapter info for', updates.length, 'items')
  }

  if (itemsWithNewChapters.length === 1) {
    const item = itemsWithNewChapters[0]
    await showNewChaptersNotification({
      title: item.title,
      chaptersAhead: item.chaptersAhead,
      coverImage: item.coverImage,
      providerId: item.providerId,
    })
  } else if (itemsWithNewChapters.length > 1) {
    await showBatchNotification(itemsWithNewChapters.length)
  }

  log.info('Check complete')
}

/**
 * Manually trigger a chapter check.
 */
export async function triggerManualCheck(): Promise<void> {
  await handleChapterCheckAlarm()
}
```

- [ ] **Step 2: Run existing tests to verify nothing broke**

Run: `npm run test`
Expected: ALL PASS (chapter checker has no dedicated test file, but other tests should still pass)

- [ ] **Step 3: Commit**

```bash
git add src/background/chapterChecker.ts
git commit -m "feat(comick): update chapter checker to route by comickSlug with ComicK-first fallback"
```

---

## Task 7: Update Genre Backfill

**Files:**
- Modify: `src/background/genreBackfill.ts`

- [ ] **Step 1: Update genre backfill with ComicK-first fallback**

Replace the `fetchFallbackGenres` function and update the processing logic to handle ComicK items. Key changes:
- New function `fetchComicKGenresByTitle` for ComicK fallback
- Fallback order: primary provider → ComicK → other provider
- Handle items with `comickSlug` by fetching detail directly

Update imports at the top:

```typescript
import { storageService } from '@/storage'
import { fetchBatchChapterInfo, searchAniList } from './anilist'
import { searchMangaDex } from './mangadex'
import { fetchComicDetail, searchComicK } from './comick'
import { createLogger } from '@/shared/logger'
import { BACKFILL_BATCH_SIZE, BACKFILL_BATCH_DELAY_MS } from '@/shared/constants'
import type { TrackedItem } from '@/shared/types'
```

Replace `fetchFallbackGenres`:

```typescript
/**
 * Try ComicK first for genre fallback, then the opposite provider.
 */
async function fetchFallbackGenres(item: TrackedItem): Promise<string[]> {
  // Try ComicK first (best genre data)
  if (item.comickSlug) {
    try {
      const detail = await fetchComicDetail(item.comickSlug)
      if (detail && detail.genres.length > 0) return detail.genres
    } catch (err) {
      log.error('ComicK detail fallback failed for', item.titles.main, ':', err)
    }
  }

  // Try ComicK search by title
  try {
    const results = await searchComicK(item.titles.main)
    if (results.length > 0) {
      // Search doesn't have genre names, fetch detail for first result
      const detail = await fetchComicDetail(results[0].slug)
      if (detail && detail.genres.length > 0) return detail.genres
    }
  } catch {
    // ComicK unavailable, continue to other providers
  }

  if (item.provider === 'anilist' || item.provider === 'comick') {
    // Fallback: search MangaDex by title
    try {
      const results = await searchMangaDex(item.titles.main)
      if (results.length > 0 && results[0].genres.length > 0) {
        return results[0].genres
      }
    } catch (err) {
      log.error('MangaDex fallback failed for', item.titles.main, ':', err)
    }
  }

  if (item.provider === 'mangadex') {
    // Fallback: search AniList by title
    try {
      const results = await searchAniList(item.titles.main)
      if (results.length > 0 && results[0].genres.length > 0) {
        return results[0].genres
      }
    } catch (err) {
      log.error('AniList fallback failed for', item.titles.main, ':', err)
    }
  }

  return []
}
```

In `runGenreBackfill`, update the provider split to also handle ComicK items (line ~73):

```typescript
  // Split by provider
  const anilistItems = pendingItems.filter((item) => item.provider === 'anilist')
  const mangadexItems = pendingItems.filter((item) => item.provider === 'mangadex')
  const comickItems = pendingItems.filter((item) => item.provider === 'comick')
```

Add ComicK processing block after the AniList block:

```typescript
  // -----------------------------------------------------------------------
  // Process ComicK items (fetch detail for genres)
  // -----------------------------------------------------------------------

  for (let i = 0; i < comickItems.length; i += BACKFILL_BATCH_SIZE) {
    const batch = comickItems.slice(i, i + BACKFILL_BATCH_SIZE)

    for (const item of batch) {
      let genres: string[] = []

      if (item.comickSlug) {
        try {
          const detail = await fetchComicDetail(item.comickSlug)
          if (detail && detail.genres.length > 0) {
            genres = detail.genres
          }
        } catch (err) {
          log.error('ComicK detail failed for', item.titles.main, ':', err)
        }
      }

      if (genres.length === 0) {
        genres = await fetchFallbackGenres(item)
      }

      await storageService.update(item.providerId, { genres, genresBackfilled: true })

      completed++
      await storageService.writeBackfillProgress({
        completed,
        total: pendingItems.length,
        status: 'running',
      })

      log.debug('Backfilled', item.titles.main, ':', genres)
    }

    if (i + BACKFILL_BATCH_SIZE < comickItems.length) {
      await new Promise((resolve) => setTimeout(resolve, BACKFILL_BATCH_DELAY_MS))
    }
  }
```

- [ ] **Step 2: Run tests**

Run: `npm run test`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add src/background/genreBackfill.ts
git commit -m "feat(comick): update genre backfill with ComicK-first fallback"
```

---

## Task 8: Export/Import Compatibility

**Files:**
- Modify: `src/storage/storageService.ts`

- [ ] **Step 1: Update `exportData` to include new fields**

In `storageService.ts`, update the `exportedItems` mapping in `exportData()` (line ~478-496) to include the new fields:

```typescript
    const exportedItems: ExportedItem[] = items.map((item) => ({
      provider: item.provider,
      providerId: item.providerId,
      mediaType: item.mediaType,
      format: item.format,
      titles: item.titles,
      coverImage: item.coverImage,
      progress: item.progress,
      lastUrl: item.lastUrl,
      updatedAt: item.updatedAt,
      createdAt: item.createdAt,
      chaptersWhenAdded: item.chaptersWhenAdded,
      latestKnownChapters: item.latestKnownChapters,
      notificationsEnabled: item.notificationsEnabled,
      anilistStatus: item.anilistStatus,
      genres: item.genres ?? [],
      tags: item.tags ?? [],
      genresBackfilled: item.genresBackfilled ?? false,
      comickHid: item.comickHid ?? null,
      comickSlug: item.comickSlug ?? null,
      anilistId: item.anilistId ?? null,
    }))
```

- [ ] **Step 2: Update `importData` to handle new fields**

Update the `normalizedItem` construction in `importData()` (line ~543-549):

```typescript
        const normalizedItem: TrackedItem = {
          ...importItem,
          genres: importItem.genres ?? [],
          tags: importItem.tags ?? [],
          genresBackfilled: importItem.genresBackfilled ?? false,
          lastApiCheck: null,
          comickHid: (importItem as TrackedItem).comickHid ?? null,
          comickSlug: (importItem as TrackedItem).comickSlug ?? null,
          anilistId: (importItem as TrackedItem).anilistId ?? null,
        }
```

- [ ] **Step 3: Run storage tests**

Run: `npm run test -- src/storage/storageService.test.ts`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add src/storage/storageService.ts
git commit -m "feat(comick): update export/import to include ComicK cross-reference fields"
```

---

## Task 9: Silent Migration

**Files:**
- Create: `src/background/migration.ts`
- Create: `src/background/migration.test.ts`
- Modify: `src/background/index.ts`

- [ ] **Step 1: Write failing tests for migration**

Create `src/background/migration.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '../../__mocks__/chrome'
import { resetChromeStorage } from '../../__mocks__/chrome'
import { migrateItemsToComicK } from './migration'
import { searchComicK, fetchComicDetail } from './comick'
import type { TrackedItem, ComicKMedia } from '@/shared/types'

vi.mock('./comick', () => ({
  searchComicK: vi.fn(),
  fetchComicDetail: vi.fn(),
  CloudflareBlockError: class extends Error {},
}))

const mockSearchComicK = vi.mocked(searchComicK)
const mockFetchDetail = vi.mocked(fetchComicDetail)

function makeTrackedItem(overrides: Partial<TrackedItem> = {}): TrackedItem {
  return {
    provider: 'anilist',
    providerId: '12345',
    mediaType: 'manga',
    format: 'MANGA',
    titles: { main: 'Test Manga', alt: [] },
    coverImage: 'https://example.com/cover.jpg',
    progress: { unit: 'chapter', value: '10' },
    lastUrl: 'https://example.com/chapter/10',
    updatedAt: Date.now(),
    createdAt: Date.now(),
    chaptersWhenAdded: 50,
    latestKnownChapters: 100,
    lastApiCheck: Date.now(),
    notificationsEnabled: true,
    anilistStatus: 'RELEASING',
    genres: ['Action'],
    tags: [],
    genresBackfilled: true,
    comickHid: null,
    comickSlug: null,
    anilistId: null,
    ...overrides,
  }
}

function makeComicKMedia(hid: string, slug: string, title: string): ComicKMedia {
  return {
    hid,
    slug,
    title,
    country: 'jp',
    status: 1,
    lastChapter: 100,
    coverUrl: 'https://meo.comick.pictures/test-s.jpg',
    altTitles: [],
    genres: [],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  resetChromeStorage()
})

describe('migrateItemsToComicK', () => {
  it('adds ComicK cross-reference when title matches', async () => {
    const item = makeTrackedItem({ providerId: '12345', titles: { main: 'Solo Leveling', alt: [] } })

    mockSearchComicK.mockResolvedValue([
      makeComicKMedia('comick-hid', 'solo-leveling', 'Solo Leveling'),
    ])

    mockFetchDetail.mockResolvedValue({
      hid: 'comick-hid',
      slug: 'solo-leveling',
      title: 'Solo Leveling',
      country: 'kr',
      status: 1,
      lastChapter: 200,
      coverUrl: 'https://meo.comick.pictures/sl-s.jpg',
      altTitles: [],
      genres: ['Action', 'Fantasy'],
      links: { anilistId: '12345' },
    })

    const result = await migrateItemsToComicK([item])

    expect(result.migrated).toBe(1)
    expect(result.skipped).toBe(0)
    expect(result.items[0].comickHid).toBe('comick-hid')
    expect(result.items[0].comickSlug).toBe('solo-leveling')
    expect(result.items[0].anilistId).toBe('12345')
  })

  it('skips items already having comickSlug', async () => {
    const item = makeTrackedItem({ comickSlug: 'already-set' })

    const result = await migrateItemsToComicK([item])

    expect(result.migrated).toBe(0)
    expect(result.skipped).toBe(1)
    expect(mockSearchComicK).not.toHaveBeenCalled()
  })

  it('confirms AniList ID match for higher confidence', async () => {
    const item = makeTrackedItem({ provider: 'anilist', providerId: '12345' })

    mockSearchComicK.mockResolvedValue([
      makeComicKMedia('comick-hid', 'test-manga', 'Test Manga'),
    ])

    mockFetchDetail.mockResolvedValue({
      hid: 'comick-hid',
      slug: 'test-manga',
      title: 'Test Manga',
      country: 'jp',
      status: 1,
      lastChapter: 100,
      coverUrl: '',
      altTitles: [],
      genres: [],
      links: { anilistId: '12345' }, // matches providerId
    })

    const result = await migrateItemsToComicK([item])

    expect(result.migrated).toBe(1)
    expect(result.items[0].anilistId).toBe('12345')
  })

  it('skips items with low confidence and no ID match', async () => {
    const item = makeTrackedItem({ titles: { main: 'My Obscure Manga', alt: [] } })

    mockSearchComicK.mockResolvedValue([
      makeComicKMedia('comick-hid', 'totally-different', 'Totally Different Title'),
    ])

    const result = await migrateItemsToComicK([item])

    expect(result.migrated).toBe(0)
    expect(result.skipped).toBe(1)
  })

  it('handles ComicK search failure gracefully', async () => {
    const item = makeTrackedItem()

    mockSearchComicK.mockRejectedValue(new Error('API error'))

    const result = await migrateItemsToComicK([item])

    expect(result.migrated).toBe(0)
    expect(result.skipped).toBe(1)
  })

  it('preserves existing progress and metadata', async () => {
    const item = makeTrackedItem({
      progress: { unit: 'chapter', value: '42' },
      tags: ['favorite'],
      notificationsEnabled: true,
    })

    mockSearchComicK.mockResolvedValue([
      makeComicKMedia('comick-hid', 'test-manga', 'Test Manga'),
    ])

    mockFetchDetail.mockResolvedValue({
      hid: 'comick-hid',
      slug: 'test-manga',
      title: 'Test Manga',
      country: 'jp',
      status: 1,
      lastChapter: 100,
      coverUrl: '',
      altTitles: [],
      genres: [],
      links: {},
    })

    const result = await migrateItemsToComicK([item])
    const migrated = result.items[0]

    expect(migrated.progress.value).toBe('42')
    expect(migrated.tags).toEqual(['favorite'])
    expect(migrated.notificationsEnabled).toBe(true)
    // providerId unchanged
    expect(migrated.providerId).toBe('12345')
    expect(migrated.provider).toBe('anilist') // provider NOT changed
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/background/migration.test.ts`
Expected: FAIL — module `./migration` not found

- [ ] **Step 3: Implement migration**

Create `src/background/migration.ts`:

```typescript
import { storageService } from '@/storage'
import { searchComicK, fetchComicDetail } from './comick'
import { normalise, scorePair } from './anilist'
import { createLogger } from '@/shared/logger'
import { MIGRATION_CONFIDENCE_THRESHOLD, MIGRATION_STORAGE_KEY, COMICK_RATE_LIMIT_DELAY_MS } from '@/shared/constants'
import type { TrackedItem } from '@/shared/types'

const log = createLogger('migration')

export interface MigrationResult {
  migrated: number
  skipped: number
  items: TrackedItem[]
}

/**
 * Attempt to add ComicK cross-references to a list of items.
 * Does NOT change providerId or provider — only adds comickHid/comickSlug/anilistId.
 * Returns the updated items array.
 */
export async function migrateItemsToComicK(items: TrackedItem[]): Promise<MigrationResult> {
  let migrated = 0
  let skipped = 0
  const resultItems = [...items]

  for (let i = 0; i < items.length; i++) {
    const item = items[i]

    // Skip items that already have a ComicK cross-reference
    if (item.comickSlug) {
      skipped++
      continue
    }

    try {
      const searchResults = await searchComicK(item.titles.main)

      if (searchResults.length === 0) {
        log.debug('No ComicK results for:', item.titles.main)
        skipped++
        continue
      }

      // Score each result against the item title
      const normTitle = normalise(item.titles.main)
      let bestResult = searchResults[0]
      let bestScore = 0
      let idMatch = false

      for (const result of searchResults) {
        const allTitles = [result.title, ...result.altTitles]
        for (const t of allTitles) {
          const score = scorePair(normTitle, normalise(t))
          if (score > bestScore) {
            bestScore = score
            bestResult = result
          }
        }
      }

      // For AniList items, try to verify via links.al ID match
      if (item.provider === 'anilist' && bestScore < 1.0) {
        const detail = await fetchComicDetail(bestResult.slug)
        if (detail?.links.anilistId === item.providerId) {
          idMatch = true
          bestScore = 1.0 // ID match = confirmed

          resultItems[i] = {
            ...item,
            comickHid: detail.hid,
            comickSlug: detail.slug,
            anilistId: detail.links.anilistId ?? null,
            genres: detail.genres.length > item.genres.length ? detail.genres : item.genres,
            latestKnownChapters: detail.lastChapter ?? item.latestKnownChapters,
          }
          migrated++
          log.debug('Migrated (ID match):', item.titles.main)
          continue
        }
      }

      // Check confidence threshold
      if (bestScore < MIGRATION_CONFIDENCE_THRESHOLD) {
        log.debug('Low confidence for', item.titles.main, ':', bestScore)
        skipped++
        continue
      }

      // Fetch detail for the best match
      const detail = await fetchComicDetail(bestResult.slug)
      if (!detail) {
        log.debug('Detail fetch failed for:', bestResult.slug)
        skipped++
        continue
      }

      resultItems[i] = {
        ...item,
        comickHid: detail.hid,
        comickSlug: detail.slug,
        anilistId: detail.links.anilistId ?? null,
        genres: detail.genres.length > item.genres.length ? detail.genres : item.genres,
        latestKnownChapters: detail.lastChapter ?? item.latestKnownChapters,
      }
      migrated++
      log.debug('Migrated (title match):', item.titles.main, 'confidence:', bestScore)
    } catch (err) {
      log.error('Migration failed for', item.titles.main, ':', err)
      skipped++
    }

    // Rate limit between items
    if (i < items.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, COMICK_RATE_LIMIT_DELAY_MS))
    }
  }

  return { migrated, skipped, items: resultItems }
}

/**
 * Run the one-time silent migration for all existing items.
 * Sets a flag in storage so it doesn't run again.
 */
export async function runSilentMigration(): Promise<void> {
  // Check if already migrated
  const flag = await new Promise<boolean>((resolve) => {
    chrome.storage.local.get(MIGRATION_STORAGE_KEY, (result) => {
      resolve(result[MIGRATION_STORAGE_KEY] === true)
    })
  })

  if (flag) {
    log.debug('Migration already complete, skipping')
    return
  }

  log.info('Starting silent ComicK migration')

  const items = await storageService.getAll()
  const needsMigration = items.filter((item) => !item.comickSlug)

  if (needsMigration.length === 0) {
    log.info('No items need migration')
    await new Promise<void>((resolve) => {
      chrome.storage.local.set({ [MIGRATION_STORAGE_KEY]: true }, resolve)
    })
    return
  }

  log.info('Migrating', needsMigration.length, 'items')

  const result = await migrateItemsToComicK(needsMigration)

  // Save migrated items back to storage
  for (const item of result.items) {
    if (item.comickSlug) {
      await storageService.update(item.providerId, {
        comickHid: item.comickHid,
        comickSlug: item.comickSlug,
        anilistId: item.anilistId,
        genres: item.genres,
        latestKnownChapters: item.latestKnownChapters,
      })
    }
  }

  // Set migration flag
  await new Promise<void>((resolve) => {
    chrome.storage.local.set({ [MIGRATION_STORAGE_KEY]: true }, resolve)
  })

  log.info('Migration complete:', result.migrated, 'migrated,', result.skipped, 'skipped')
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/background/migration.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Add migration trigger to background index**

In `src/background/index.ts`, add the import:

```typescript
import { runSilentMigration } from './migration'
```

Add the migration trigger after the genre backfill call (line ~26):

```typescript
// Run genre backfill for existing items (non-blocking)
runGenreBackfill().catch((err) => log.error('Genre backfill failed:', err))

// Run silent ComicK migration (non-blocking, after backfill)
runSilentMigration().catch((err) => log.error('ComicK migration failed:', err))
```

- [ ] **Step 6: Commit**

```bash
git add src/background/migration.ts src/background/migration.test.ts src/background/index.ts
git commit -m "feat(comick): add silent migration to cross-reference existing items with ComicK"
```

---

## Task 10: Full Integration Verification

**Files:** None (verification only)

- [ ] **Step 1: Run all tests**

Run: `npm run test`
Expected: ALL PASS

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS with no errors. If errors exist, fix them — likely missing new fields in places that construct `TrackedItem` objects.

Common fixes needed:
- Any place that constructs a `TrackedItem` literal needs `comickHid: null, comickSlug: null, anilistId: null`
- The `__mocks__/chrome.ts` may need no changes (it's just storage mock)
- Test helper functions that create `TrackedItem` objects need the new fields

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 4: Run build**

Run: `npm run build`
Expected: PASS — production build completes successfully

- [ ] **Step 5: Fix any issues found**

Address any typecheck, lint, or build errors. Common issues:
- Missing `comickHid`/`comickSlug`/`anilistId` fields in test fixtures
- Import path issues for new modules
- Unused import warnings

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "fix(comick): resolve typecheck and lint issues from ComicK integration"
```

- [ ] **Step 7: Verify all checks pass**

Run: `npm run typecheck && npm run lint && npm run test && npm run build`
Expected: ALL PASS
