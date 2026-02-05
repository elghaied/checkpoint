import type { MangaDexMedia } from '@/shared/types'

const MANGADEX_API = 'https://api.mangadex.org'

interface MangaDexTitle {
  [lang: string]: string
}

interface MangaDexRelationship {
  id: string
  type: string
  attributes?: {
    fileName?: string
  }
}

interface MangaDexMangaAttributes {
  title: MangaDexTitle
  altTitles: MangaDexTitle[]
  originalLanguage: string
  status: string | null
  lastChapter: string | null
}

interface MangaDexMangaResult {
  id: string
  type: 'manga'
  attributes: MangaDexMangaAttributes
  relationships: MangaDexRelationship[]
}

interface MangaDexSearchResponse {
  result: 'ok' | 'error'
  data: MangaDexMangaResult[]
}

/**
 * Extract the best primary title from MangaDex's multi-language title object.
 * Priority: en > ja-ro > ko-ro > first available
 */
function extractPrimaryTitle(title: MangaDexTitle): string {
  return (
    title['en'] ||
    title['ja-ro'] ||
    title['ko-ro'] ||
    Object.values(title)[0] ||
    'Unknown Title'
  )
}

/**
 * Extract all alternative titles from the altTitles array.
 */
function extractAltTitles(altTitles: MangaDexTitle[]): string[] {
  const titles: string[] = []
  for (const titleObj of altTitles) {
    titles.push(...Object.values(titleObj))
  }
  return titles
}

/**
 * Construct the cover URL from MangaDex relationships.
 */
function extractCoverUrl(mangaId: string, relationships: MangaDexRelationship[]): string {
  const coverRel = relationships.find((r) => r.type === 'cover_art')
  if (coverRel?.attributes?.fileName) {
    return `https://uploads.mangadex.org/covers/${mangaId}/${coverRel.attributes.fileName}.256.jpg`
  }
  // Fallback to a placeholder
  return ''
}

/**
 * Search MangaDex for manga matching the given title string.
 */
export async function searchMangaDex(query: string): Promise<MangaDexMedia[]> {
  console.log('[mangadex] Searching for:', query)

  const url = new URL(`${MANGADEX_API}/manga`)
  url.searchParams.set('title', query)
  url.searchParams.set('limit', '10')
  url.searchParams.append('includes[]', 'cover_art')

  let response: Response

  try {
    response = await fetch(url.toString())
  } catch (err) {
    console.error('[mangadex] Network error during search:', err)
    return []
  }

  console.log('[mangadex] Response status:', response.status)

  if (!response.ok) {
    const text = await response.text()
    console.error('[mangadex] MangaDex returned HTTP', response.status, text)
    return []
  }

  const json: MangaDexSearchResponse = await response.json()

  if (json.result !== 'ok') {
    console.error('[mangadex] API returned error result')
    return []
  }

  const results: MangaDexMedia[] = json.data.map((manga) => ({
    id: manga.id,
    title: extractPrimaryTitle(manga.attributes.title),
    altTitles: extractAltTitles(manga.attributes.altTitles),
    coverUrl: extractCoverUrl(manga.id, manga.relationships),
    originalLanguage: manga.attributes.originalLanguage,
    status: manga.attributes.status,
    lastChapter: manga.attributes.lastChapter,
  }))

  console.log('[mangadex] Found', results.length, 'results')

  return results
}

// ---------------------------------------------------------------------------
// Chapter info fetching
// ---------------------------------------------------------------------------

export interface MangaDexChapterResult {
  id: string
  status: string | null
  lastChapter: number | null
}

interface MangaDexMangaResponse {
  result: 'ok' | 'error'
  data: {
    id: string
    attributes: {
      status: string | null
      lastChapter: string | null
    }
  }
}

/**
 * Fetch chapter info for a single manga by ID.
 */
async function fetchSingleMangaInfo(mangaId: string): Promise<MangaDexChapterResult | null> {
  const url = `${MANGADEX_API}/manga/${mangaId}`

  try {
    const response = await fetch(url)

    if (!response.ok) {
      console.error('[mangadex] Failed to fetch manga', mangaId, ':', response.status)
      return null
    }

    const json: MangaDexMangaResponse = await response.json()

    if (json.result !== 'ok') {
      return null
    }

    const lastChapter = json.data.attributes.lastChapter
      ? parseInt(json.data.attributes.lastChapter, 10)
      : null

    return {
      id: mangaId,
      status: json.data.attributes.status,
      lastChapter: isNaN(lastChapter as number) ? null : lastChapter,
    }
  } catch (err) {
    console.error('[mangadex] Error fetching manga', mangaId, ':', err)
    return null
  }
}

/**
 * Fetch chapter info for multiple manga by their MangaDex IDs.
 * MangaDex doesn't have a true batch endpoint, so we fetch individually with rate limiting.
 */
export async function fetchBatchMangaDexInfo(
  mangaIds: string[]
): Promise<Map<string, MangaDexChapterResult>> {
  const results = new Map<string, MangaDexChapterResult>()

  if (mangaIds.length === 0) {
    return results
  }

  console.log('[mangadex] Fetching chapter info for', mangaIds.length, 'items')

  // Fetch sequentially with small delay to respect rate limits
  for (const id of mangaIds) {
    const info = await fetchSingleMangaInfo(id)
    if (info) {
      results.set(id, info)
    }

    // Small delay between requests (MangaDex rate limit is 5 req/sec)
    if (mangaIds.length > 1) {
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }

  console.log('[mangadex] Fetched info for', results.size, 'items')

  return results
}
