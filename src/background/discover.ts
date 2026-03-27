import type { DiscoverItem, TrackedItem } from '@/shared/types'
import { COMICK_API_BASE } from '@/shared/constants'
import { fetchWithRetry } from './retry'
import { createLogger } from '@/shared/logger'
import { TTLCache } from './cache'

const log = createLogger('discover')
const trendingCache = new TTLCache<DiscoverItem[]>(15 * 60 * 1000) // 15 min
const forYouCache = new TTLCache<DiscoverItem[]>(15 * 60 * 1000)

/** Clear all in-memory caches — intended for use in tests only. */
export function clearDiscoverCaches(): void {
  trendingCache.clear()
  forYouCache.clear()
}

const COMICK_HEADERS: Record<string, string> = {
  'Accept': 'application/json',
  'Referer': 'https://comick.io/',
}

interface ComicKTrendingItem {
  hid: string
  slug: string
  title: string
  // /top endpoint uses md_covers instead of cover_url
  cover_url?: string
  md_covers?: Array<{ b2key: string; w: number; h: number }>
  country: string
  status?: number
  last_chapter: number | null
  rating?: string | null
  user_follow_count?: number
  view_count?: number
  md_titles: Array<{ title: string }>
  genres: number[]
}

function extractCoverUrl(item: ComicKTrendingItem): string {
  if (item.cover_url) return item.cover_url
  if (item.md_covers && item.md_covers.length > 0) {
    // The "-s" thumbnail suffix only works for .jpg on ComicK CDN.
    // For .png/.webp, use the original file to avoid 404s.
    const b2key = item.md_covers[0].b2key
    const ext = b2key.slice(b2key.lastIndexOf('.')).toLowerCase()
    const useThumb = ext === '.jpg' || ext === '.jpeg'
    const dotIndex = b2key.lastIndexOf('.')
    const thumbKey = useThumb && dotIndex > 0
      ? `${b2key.slice(0, dotIndex)}-s${b2key.slice(dotIndex)}`
      : b2key
    return `https://meo.comick.pictures/${thumbKey}`
  }
  return ''
}

function normalizeDiscoverItem(item: ComicKTrendingItem): DiscoverItem {
  return {
    hid: item.hid,
    slug: item.slug,
    title: item.title,
    coverUrl: extractCoverUrl(item),
    country: item.country,
    status: item.status ?? 0,
    lastChapter: item.last_chapter != null ? Math.floor(item.last_chapter) : null,
    rating: item.rating ?? null,
    followCount: item.user_follow_count ?? item.view_count ?? 0,
    altTitles: (item.md_titles ?? []).map((t) => t.title),
    genres: item.genres ?? [],
  }
}

/**
 * Fetch trending comics from ComicK.
 */
export async function fetchTrending(comicTypes?: string[]): Promise<DiscoverItem[]> {
  const cacheKey = `trending-${comicTypes?.join(',') ?? 'all'}`
  const cached = trendingCache.get(cacheKey)
  if (cached) return cached

  const url = new URL(`${COMICK_API_BASE}/top`)
  url.searchParams.set('tachiyomi', 'true')
  url.searchParams.set('type', 'trending')
  if (comicTypes && comicTypes.length > 0) {
    for (const t of comicTypes) {
      url.searchParams.append('comic_types', t)
    }
  }

  try {
    const response = await fetchWithRetry(url.toString(), { headers: COMICK_HEADERS })
    if (!response.ok) {
      log.error('Trending fetch failed:', response.status)
      return []
    }

    const json = await response.json()
    // /top returns { rank: [...], recentRank: [...], trending: {...} }
    const data: ComicKTrendingItem[] = json.rank ?? json ?? []
    const results = Array.isArray(data) ? data.map(normalizeDiscoverItem) : []
    trendingCache.set(cacheKey, results)
    log.debug('Fetched', results.length, 'trending items')
    return results
  } catch (err) {
    log.error('Trending fetch error:', err)
    return []
  }
}

/**
 * Compute "For You" recommendations based on user's tracked items.
 * Combines genre-based trending search + deduplication.
 */
export async function computeForYou(
  trackedItems: TrackedItem[],
  trackedSlugs: Set<string>
): Promise<DiscoverItem[]> {
  const cached = forYouCache.get('forYou')
  if (cached) return cached

  if (trackedItems.length === 0) return []

  // Count genres across tracked items
  const genreCounts = new Map<string, number>()
  for (const item of trackedItems) {
    for (const genre of item.genres) {
      genreCounts.set(genre, (genreCounts.get(genre) ?? 0) + 1)
    }
  }

  // Get top 3 genres
  const topGenres = [...genreCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([genre]) => genre.toLowerCase().replace(/\s+/g, '-'))

  if (topGenres.length === 0) return []

  log.debug('Top genres for recommendations:', topGenres)

  // Search ComicK for popular manga in user's top genres
  const url = new URL(`${COMICK_API_BASE}/v1.0/search/`)
  url.searchParams.set('tachiyomi', 'true')
  url.searchParams.set('sort', 'follow')
  url.searchParams.set('limit', '50')
  url.searchParams.set('page', '1')
  for (const genre of topGenres) {
    url.searchParams.append('genres', genre)
  }

  try {
    const response = await fetchWithRetry(url.toString(), { headers: COMICK_HEADERS })
    if (!response.ok) {
      log.error('For You fetch failed:', response.status)
      return []
    }

    const data: ComicKTrendingItem[] = await response.json()
    const results = data
      .map(normalizeDiscoverItem)
      .filter((item) => !trackedSlugs.has(item.slug) && !trackedSlugs.has(item.hid))

    forYouCache.set('forYou', results)
    log.debug('Computed', results.length, 'For You recommendations')
    return results
  } catch (err) {
    log.error('For You computation error:', err)
    return []
  }
}
