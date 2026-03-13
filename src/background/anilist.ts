import { AniListMedia } from '@/shared/types'
import { cleanSearchQuery, getFormat } from '@/shared/utils'
import type { MediaFormat } from '@/shared/utils'
import { SEARCH_RESULTS_PER_PAGE, BATCH_FETCH_PAGE_SIZE } from '@/shared/constants'
import { fetchWithRetry } from './retry'
import { createLogger } from '@/shared/logger'
import { TTLCache } from './cache'

const log = createLogger('anilist')
const searchCache = new TTLCache<AniListMedia[]>(5 * 60 * 1000) // 5 minutes

// ---------------------------------------------------------------------------
// GraphQL
// ---------------------------------------------------------------------------

const SEARCH_MANGA_QUERY = `
  query SearchManga($query: String!) {
    Page(perPage: ${SEARCH_RESULTS_PER_PAGE}) {
      media(search: $query, type: MANGA, sort: SEARCH_MATCH) {
        id
        type
        format
        title {
          romaji
          english
          native
        }
        synonyms
        coverImage {
          large
          medium
        }
        countryOfOrigin
        status
        chapters
      }
    }
  }
`

const BATCH_MANGA_QUERY = `
  query BatchManga($ids: [Int]) {
    Page(perPage: ${BATCH_FETCH_PAGE_SIZE}) {
      media(id_in: $ids, type: MANGA) {
        id
        status
        chapters
      }
    }
  }
`

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

const ANILIST_ENDPOINT = 'https://graphql.anilist.co'

interface AniListResponse {
  data?: {
    Page: {
      media: AniListMedia[]
    }
  }
  errors?: { message: string }[]
}

interface BatchMediaResult {
  id: number
  status: string
  chapters: number | null
}

interface AniListBatchResponse {
  data?: {
    Page: {
      media: BatchMediaResult[]
    }
  }
  errors?: { message: string }[]
}

/**
 * Search AniList for manga matching the given title string.
 * Returns the media array from the response, or an empty array on failure.
 */
export async function searchAniList(query: string): Promise<AniListMedia[]> {
  const cleanedQuery = cleanSearchQuery(query) || query // fallback to original if filtering removes everything
  const cacheKey = cleanedQuery.toLowerCase().trim()
  const cached = searchCache.get(cacheKey)
  if (cached) {
    log.debug('Cache hit for:', cacheKey)
    return cached
  }

  log.debug('Searching for:', cleanedQuery, '(original:', query, ')')

  let response: Response

  try {
    response = await fetchWithRetry(ANILIST_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: SEARCH_MANGA_QUERY,
        variables: { query: cleanedQuery },
      }),
    })
  } catch (err) {
    log.error('Network error during search:', err)
    return []
  }

  log.debug('Response status:', response.status)

  if (!response.ok) {
    const text = await response.text()
    log.error('AniList returned HTTP', response.status, text)
    return []
  }

  const json: AniListResponse = await response.json()

  if (json.errors && json.errors.length > 0) {
    log.error('GraphQL errors:', json.errors.map((e) => e.message))
    return []
  }

  const results = json.data?.Page.media ?? []
  log.debug('Found', results.length, 'results')

  searchCache.set(cacheKey, results)
  return results
}

// ---------------------------------------------------------------------------
// Title matching
// ---------------------------------------------------------------------------

export interface MatchResult {
  media: AniListMedia
  confidence: number // 0–1, higher is better
}

/**
 * Collect every title string associated with a single AniListMedia entry.
 */
export function collectTitles(media: AniListMedia): string[] {
  const { romaji, english, native } = media.title
  const candidates: string[] = [romaji, ...media.synonyms]
  if (english) candidates.push(english)
  if (native) candidates.push(native)
  return candidates
}

/**
 * Normalise a string for comparison: lowercase and collapse whitespace.
 */
export function normalise(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * Compute a similarity score between two already-normalised strings.
 *
 * Scoring tiers (all case-insensitive, whitespace-collapsed):
 *   1.0       – exact match
 *   0.9       – one string starts with the other (prefix match)
 *   0.85      – space-stripped exact match
 *   0.8       – space-stripped prefix match
 *   0.7       – substring match (regular or space-stripped)
 *   0.01–0.65 – token overlap (Jaccard similarity, capped at 0.65)
 *   0.0       – zero shared tokens or string too short
 *
 * The best score across all titles for a given media entry is kept.
 */
export function scorePair(a: string, b: string): number {
  if (a === b) {
    // Two empty strings are not a meaningful match
    return a.length === 0 ? 0 : 1.0
  }
  const shorter = a.length <= b.length ? a : b
  if (shorter.length < 3) return 0
  if (a.startsWith(b) || b.startsWith(a)) return 0.9
  if (a.includes(b) || b.includes(a)) return 0.7

  // Space-stripped comparison for titles like "Rairairai" vs "Rai Rai Rai"
  const spacelessA = a.replace(/ /g, '')
  const spacelessB = b.replace(/ /g, '')
  if (spacelessA === spacelessB) return 0.85
  if (spacelessA.startsWith(spacelessB) || spacelessB.startsWith(spacelessA)) return 0.8
  if (spacelessA.includes(spacelessB) || spacelessB.includes(spacelessA)) return 0.7

  // Token overlap (Jaccard similarity), capped at 0.65
  const tokensA = new Set(a.split(/[^a-z0-9]+/).filter(Boolean))
  const tokensB = new Set(b.split(/[^a-z0-9]+/).filter(Boolean))
  let intersection = 0
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++
  }
  const union = new Set([...tokensA, ...tokensB]).size
  if (union === 0) return 0
  return Math.min(intersection / union, 0.65)
}

/**
 * Compare an extracted title against every title in every candidate media
 * entry and return the single best match, or null when nothing scores above 0.
 */
export function matchTitle(extracted: string, mediaList: AniListMedia[]): MatchResult | null {
  const normExtracted = normalise(extracted)
  let best: MatchResult | null = null

  for (const media of mediaList) {
    const titles = collectTitles(media)
    let topScore = 0

    for (const t of titles) {
      const score = scorePair(normExtracted, normalise(t))
      if (score > topScore) topScore = score
    }

    if (topScore > 0 && (best === null || topScore > best.confidence)) {
      best = { media, confidence: topScore }
    }

    // Perfect match – no need to keep looking
    if (best && best.confidence === 1.0) break
  }

  return best
}

// Re-export for backward compatibility
export { getFormat }
export type { MediaFormat }

// ---------------------------------------------------------------------------
// Batch fetch for chapter checking
// ---------------------------------------------------------------------------

export interface BatchChapterResult {
  id: string
  status: string | null
  chapters: number | null
}

/**
 * Fetch chapter and status info for multiple manga by their AniList IDs.
 * Returns a map of providerId -> { status, chapters }
 */
export async function fetchBatchChapterInfo(
  providerIds: string[]
): Promise<Map<string, BatchChapterResult>> {
  const results = new Map<string, BatchChapterResult>()

  if (providerIds.length === 0) {
    return results
  }

  // Convert string IDs to numbers for AniList API
  const ids = providerIds.map((id) => parseInt(id, 10)).filter((id) => !isNaN(id))

  if (ids.length === 0) {
    return results
  }

  log.debug('Batch fetching chapter info for', ids.length, 'items')

  let response: Response

  try {
    response = await fetchWithRetry(ANILIST_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: BATCH_MANGA_QUERY,
        variables: { ids },
      }),
    })
  } catch (err) {
    log.error('Network error during batch fetch:', err)
    return results
  }

  if (!response.ok) {
    const text = await response.text()
    log.error('Batch fetch returned HTTP', response.status, text)
    return results
  }

  const json: AniListBatchResponse = await response.json()

  if (json.errors && json.errors.length > 0) {
    log.error('GraphQL errors:', json.errors.map((e) => e.message))
    return results
  }

  const media = json.data?.Page.media ?? []
  log.debug('Batch fetch returned', media.length, 'results')

  for (const m of media) {
    results.set(String(m.id), {
      id: String(m.id),
      status: m.status,
      chapters: m.chapters,
    })
  }

  return results
}
