import { AniListMedia } from '@/shared/types'

// ---------------------------------------------------------------------------
// GraphQL
// ---------------------------------------------------------------------------

const SEARCH_MANGA_QUERY = `
  query SearchManga($query: String!) {
    Page(perPage: 10) {
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

/**
 * Search AniList for manga matching the given title string.
 * Returns the media array from the response, or an empty array on failure.
 */
export async function searchAniList(query: string): Promise<AniListMedia[]> {
  console.log('[anilist] Searching for:', query)

  let response: Response

  try {
    response = await fetch(ANILIST_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: SEARCH_MANGA_QUERY,
        variables: { query },
      }),
    })
  } catch (err) {
    console.error('[anilist] Network error during search:', err)
    return []
  }

  console.log('[anilist] Response status:', response.status)

  if (!response.ok) {
    const text = await response.text()
    console.error('[anilist] AniList returned HTTP', response.status, text)
    return []
  }

  const json: AniListResponse = await response.json()
  console.log('[anilist] Response:', JSON.stringify(json, null, 2))

  if (json.errors && json.errors.length > 0) {
    console.error('[anilist] GraphQL errors:', json.errors.map((e) => e.message))
    return []
  }

  const results = json.data?.Page.media ?? []
  console.log('[anilist] Found', results.length, 'results')

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
function collectTitles(media: AniListMedia): string[] {
  const { romaji, english, native } = media.title
  const candidates: string[] = [romaji, native, ...media.synonyms]
  if (english) candidates.push(english)
  return candidates
}

/**
 * Normalise a string for comparison: lowercase and collapse whitespace.
 */
function normalise(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * Compute a similarity score between two already-normalised strings.
 *
 * Scoring tiers (all case-insensitive, whitespace-collapsed):
 *   1.0  – exact match
 *   0.9  – one string starts with the other (prefix match)
 *   0.7  – one string contains the other (substring match)
 *   0.0  – no containment relationship
 *
 * The best score across all titles for a given media entry is kept.
 */
function scorePair(a: string, b: string): number {
  if (a === b) return 1.0
  if (a.startsWith(b) || b.startsWith(a)) return 0.9
  if (a.includes(b) || b.includes(a)) return 0.7
  return 0
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

// ---------------------------------------------------------------------------
// Format mapping
// ---------------------------------------------------------------------------

export type MediaFormat = 'MANGA' | 'MANHWA' | 'MANHUA'

/**
 * Derive the reading format from the country of origin reported by AniList.
 *
 *   JP          → MANGA
 *   KR          → MANHWA
 *   CN | TW     → MANHUA
 *   null / other → MANGA  (safe default)
 */
export function getFormat(countryOfOrigin: string | null): MediaFormat {
  switch (countryOfOrigin) {
    case 'JP':
      return 'MANGA'
    case 'KR':
      return 'MANHWA'
    case 'CN':
    case 'TW':
      return 'MANHUA'
    default:
      return 'MANGA'
  }
}
