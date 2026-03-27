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
 * Boost confidence for top-ranked results from providers with reliable search ranking.
 * ComicK and AniList both have good relevance-sorted search — their #1 result is almost
 * always correct even with typos and missing words. MangaDex ranking is unreliable and
 * should NOT use this boost.
 *
 * Position 0 (result #1) → max(tokenScore, 0.85)
 * Position 1 (result #2) → max(tokenScore, 0.75)
 * Position 2 (result #3) → max(tokenScore, 0.65)
 * Position 3+             → tokenScore only
 */
const POSITION_BOOSTS = [0.85, 0.75, 0.65]

function applyPositionBoost(index: number, tokenScore: number): number {
  const boost = POSITION_BOOSTS[index]
  return boost !== undefined ? Math.max(tokenScore, boost) : tokenScore
}

/**
 * Convert AniList results to unified format with confidence scores.
 * AniList uses `sort: SEARCH_MATCH` which provides reliable relevance ranking,
 * so top results get a position-based confidence boost.
 */
function normalizeAniListResults(
  results: AniListMedia[],
  extractedTitle: string
): UnifiedSearchResult[] {
  return results.map((media, index) => {
    const titles = collectTitles(media)
    const tokenScore = calculateConfidence(extractedTitle, titles)
    const confidence = applyPositionBoost(index, tokenScore)

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

    // Parse lastChapter to number if available
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
 * Convert ComicK results to unified format with confidence scores.
 * ComicK has reliable fuzzy search ranking (handles typos, prefix matching),
 * so top results get a position-based confidence boost.
 */
function normalizeComicKResults(
  results: ComicKMedia[],
  extractedTitle: string
): UnifiedSearchResult[] {
  return results.map((media, index) => {
    const tokenScore = calculateConfidence(extractedTitle, [media.title, ...media.altTitles])
    const confidence = applyPositionBoost(index, tokenScore)

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
 * Filter normalized results to those meeting the confidence threshold.
 * Returns sorted array (descending confidence) or null if none pass.
 */
function tryProvider(normalized: UnifiedSearchResult[]): UnifiedSearchResult[] | null {
  const valid = normalized.filter((r) => r.confidence >= CONFIDENCE_THRESHOLD)
  if (valid.length === 0) return null
  return valid.sort((a, b) => b.confidence - a.confidence)
}

/**
 * Search with fallback: ComicK first, then AniList, then MangaDex if no valid matches.
 * Returns results that meet the confidence threshold from whichever provider succeeds first.
 */
export async function searchWithFallback(
  query: string,
  extractedTitle: string
): Promise<UnifiedSearchResult[]> {
  // Prefer extractedTitle (clean manga name) over the full query (may include chapter, site name, etc.)
  const searchQuery = cleanSearchQuery(extractedTitle || query) || cleanSearchQuery(query) || query
  log.info('Searching with fallback for:', searchQuery, '(original:', query, ', extracted:', extractedTitle, ')')

  // Clean the extracted title for confidence scoring (remove noise words)
  const cleanedExtractedTitle = cleanSearchQuery(extractedTitle) || extractedTitle

  // Try ComicK first
  let comickResults: UnifiedSearchResult[] = []
  try {
    const rawComicK = await searchComicK(searchQuery)
    comickResults = normalizeComicKResults(rawComicK, cleanedExtractedTitle)
    log.debug('ComicK:', rawComicK.length, 'total,', comickResults.filter((r) => r.confidence >= CONFIDENCE_THRESHOLD).length, 'above threshold')

    const validComicK = tryProvider(comickResults)
    if (validComicK) {
      return validComicK
    }
  } catch (err) {
    if (err instanceof CloudflareBlockError) {
      log.warn('ComicK blocked by Cloudflare, falling through to AniList:', err.message)
    } else {
      throw err
    }
  }

  // Try AniList
  const anilistResults = await searchAniList(searchQuery)
  const normalizedAnilist = normalizeAniListResults(anilistResults, cleanedExtractedTitle)

  log.debug(
    'AniList:',
    anilistResults.length,
    'total,',
    normalizedAnilist.filter((r) => r.confidence >= CONFIDENCE_THRESHOLD).length,
    'above threshold'
  )

  const validAnilist = tryProvider(normalizedAnilist)
  if (validAnilist) {
    return validAnilist
  }

  // No AniList results passed threshold — return top 5 low-confidence results if available
  if (normalizedAnilist.length > 0) {
    log.info('AniList had no valid matches, returning top low-confidence results')
    return normalizedAnilist.sort((a, b) => b.confidence - a.confidence).slice(0, MAX_LOW_CONFIDENCE_RESULTS)
  }

  // Fallback to MangaDex
  log.info('AniList had no results, trying MangaDex')
  const mangadexResults = await searchMangaDex(searchQuery)
  const normalizedMangadex = normalizeMangaDexResults(mangadexResults, cleanedExtractedTitle)

  log.debug(
    'MangaDex:',
    mangadexResults.length,
    'total,',
    normalizedMangadex.filter((r) => r.confidence >= CONFIDENCE_THRESHOLD).length,
    'above threshold'
  )

  const validMangadex = tryProvider(normalizedMangadex)
  if (validMangadex) {
    return validMangadex
  }

  // No MangaDex results passed threshold — return top 5 low-confidence results
  if (normalizedMangadex.length > 0) {
    log.info('MangaDex had no valid matches, returning top low-confidence results')
    return normalizedMangadex.sort((a, b) => b.confidence - a.confidence).slice(0, MAX_LOW_CONFIDENCE_RESULTS)
  }

  // Nothing from ComicK low-confidence either (e.g. Cloudflare blocked and others empty)
  if (comickResults.length > 0) {
    log.info('ComicK had low-confidence results, returning top results as last resort')
    return comickResults.sort((a, b) => b.confidence - a.confidence).slice(0, MAX_LOW_CONFIDENCE_RESULTS)
  }

  return []
}
