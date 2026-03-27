import type { ComicKMedia } from '@/shared/types'
import {
  COMICK_API_BASE,
  SEARCH_RESULTS_PER_PAGE,
  COMICK_BATCH_SIZE,
  COMICK_RATE_LIMIT_DELAY_MS,
} from '@/shared/constants'
import { mapComickStatus } from '@/shared/utils'
import { fetchWithRetry } from './retry'
import { createLogger } from '@/shared/logger'
import { TTLCache } from './cache'

const log = createLogger('comick')

const searchCache = new TTLCache<ComicKMedia[]>(5 * 60 * 1000) // 5 minutes

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Thrown when ComicK returns 403 or 503 (typically Cloudflare blocking).
 */
export class CloudflareBlockError extends Error {
  constructor(status: number) {
    super(`ComicK blocked by Cloudflare (HTTP ${status})`)
    this.name = 'CloudflareBlockError'
  }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const COMICK_HEADERS = {
  Accept: 'application/json',
  Referer: 'https://comick.io/',
}

/**
 * Build a ComicK API URL with tachiyomi=true always appended.
 */
function buildUrl(path: string, params: Record<string, string> = {}): string {
  const url = new URL(`${COMICK_API_BASE}${path}`)
  url.searchParams.set('tachiyomi', 'true')
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }
  return url.toString()
}

// ---------------------------------------------------------------------------
// Raw response shapes
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
}

interface ComicKGenreEntry {
  md_genres: {
    name: string
    group: string
  }
}

interface ComicKComicDetail {
  hid: string
  slug: string
  title: string
  country: string
  status: number
  last_chapter: number | null
  cover_url: string
  md_titles: Array<{ title: string }>
  md_comic_md_genres: ComicKGenreEntry[]
  links: Record<string, string | null> | null
}

interface ComicKDetailResponse {
  comic: ComicKComicDetail
}

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

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
    anilistId: string | null
    malId: string | null
  }
}

export interface ComicKChapterResult {
  slug: string
  status: string | null
  chapters: number | null
  genres: string[]
}

export interface ComicKEnrichment {
  hid: string
  slug: string
  anilistId: string | null
  altTitles: string[]
  genres: string[]
}

// ---------------------------------------------------------------------------
// Normalisation helpers
// ---------------------------------------------------------------------------

function normalizeSearchItem(item: ComicKSearchItem): ComicKMedia {
  return {
    hid: item.hid,
    slug: item.slug,
    title: item.title,
    country: item.country,
    status: item.status,
    lastChapter: item.last_chapter !== null ? Math.floor(item.last_chapter) : null,
    coverUrl: item.cover_url,
    altTitles: (item.md_titles ?? []).map((t) => t.title),
    genres: [], // genres always empty from search; resolved via detail endpoint
  }
}

function normalizeDetailGenres(genres: ComicKGenreEntry[]): string[] {
  return (genres ?? [])
    .filter((g) => g.md_genres.group === 'Genre' || g.md_genres.group === 'Theme')
    .map((g) => g.md_genres.name)
}

function normalizeDetail(comic: ComicKComicDetail): ComicKDetail {
  const links = comic.links ?? {}
  return {
    hid: comic.hid,
    slug: comic.slug,
    title: comic.title,
    country: comic.country,
    status: comic.status,
    lastChapter: comic.last_chapter !== null ? Math.floor(comic.last_chapter) : null,
    coverUrl: comic.cover_url,
    altTitles: (comic.md_titles ?? []).map((t) => t.title),
    genres: normalizeDetailGenres(comic.md_comic_md_genres ?? []),
    links: {
      anilistId: links.al ?? null,
      malId: links.mal ?? null,
    },
  }
}

// ---------------------------------------------------------------------------
// searchComicK
// ---------------------------------------------------------------------------

/**
 * Search ComicK for manga matching the given query string.
 * Returns an array of ComicKMedia, or an empty array on failure.
 * Throws CloudflareBlockError on 403/503.
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
    t: 'true',
  })

  log.debug('Search URL:', url)

  let response: Response

  try {
    response = await fetchWithRetry(url, { headers: COMICK_HEADERS })
  } catch (err) {
    log.error('Network error during search:', err)
    return []
  }

  log.debug('Response status:', response.status)

  if (response.status === 403 || response.status === 503) {
    throw new CloudflareBlockError(response.status)
  }

  if (!response.ok) {
    const text = await response.text()
    log.error('ComicK returned HTTP', response.status, text)
    return []
  }

  const json: ComicKSearchItem[] = await response.json()

  const results = json.map(normalizeSearchItem)

  log.debug('Found', results.length, 'results')

  searchCache.set(cacheKey, results)
  return results
}

// ---------------------------------------------------------------------------
// fetchComicDetail
// ---------------------------------------------------------------------------

/**
 * Fetch detailed info for a ComicK comic by slug.
 * Returns ComicKDetail with genres and links, or null on error.
 */
export async function fetchComicDetail(slug: string): Promise<ComicKDetail | null> {
  const url = buildUrl(`/comic/${slug}/`)

  log.debug('Fetching detail for slug:', slug, '— URL:', url)

  try {
    const response = await fetchWithRetry(url, { headers: COMICK_HEADERS })

    if (!response.ok) {
      log.error('ComicK detail returned HTTP', response.status, 'for slug:', slug)
      return null
    }

    const json: ComicKDetailResponse = await response.json()

    return normalizeDetail(json.comic)
  } catch (err) {
    log.error('Error fetching detail for slug', slug, ':', err)
    return null
  }
}

// ---------------------------------------------------------------------------
// enrichComicKResult
// ---------------------------------------------------------------------------

/**
 * Fetch enrichment data for a ComicK result.
 * Used at save time to get richer alt titles, anilistId, and genres.
 */
export async function enrichComicKResult(slug: string): Promise<ComicKEnrichment | null> {
  const detail = await fetchComicDetail(slug)
  if (!detail) return null

  return {
    hid: detail.hid,
    slug: detail.slug,
    anilistId: detail.links.anilistId ?? null,
    altTitles: detail.altTitles,
    genres: detail.genres,
  }
}

// ---------------------------------------------------------------------------
// fetchBatchComicKInfo
// ---------------------------------------------------------------------------

/**
 * Fetch chapter info for multiple comics by their ComicK slugs.
 * Fetches individually with rate-limited batching.
 * Returns a Map<slug, ComicKChapterResult>.
 */
export async function fetchBatchComicKInfo(
  slugs: string[]
): Promise<Map<string, ComicKChapterResult>> {
  const results = new Map<string, ComicKChapterResult>()

  if (slugs.length === 0) {
    return results
  }

  log.debug('Fetching chapter info for', slugs.length, 'ComicK slugs')

  for (let i = 0; i < slugs.length; i += COMICK_BATCH_SIZE) {
    const batch = slugs.slice(i, i + COMICK_BATCH_SIZE)

    const batchResults = await Promise.allSettled(
      batch.map((slug) => fetchComicDetail(slug))
    )

    for (let j = 0; j < batchResults.length; j++) {
      const result = batchResults[j]
      const slug = batch[j]
      if (result.status === 'fulfilled' && result.value !== null) {
        const detail = result.value
        results.set(slug, {
          slug,
          status: mapComickStatus(detail.status),
          chapters: detail.lastChapter,
          genres: detail.genres,
        })
        log.debug(`  Batch fetched: slug="${slug}" chapters=${detail.lastChapter ?? 'null'} status=${mapComickStatus(detail.status)}`)
      } else if (result.status === 'rejected') {
        log.error(`  Batch fetch failed for slug="${slug}":`, result.reason)
      } else {
        log.debug(`  Batch fetch returned null for slug="${slug}"`)
      }
    }

    // Delay between batches (skip after last batch)
    if (i + COMICK_BATCH_SIZE < slugs.length) {
      await new Promise((resolve) => setTimeout(resolve, COMICK_RATE_LIMIT_DELAY_MS))
    }
  }

  log.debug('Fetched info for', results.size, 'ComicK items')

  return results
}
