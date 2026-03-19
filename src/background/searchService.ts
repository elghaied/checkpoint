import type { AniListMedia, MangaDexMedia, UnifiedSearchResult } from '@/shared/types'
import { cleanSearchQuery, getFormat, getFormatFromLanguage } from '@/shared/utils'
import { searchAniList, collectTitles, normalise, scorePair } from './anilist'
import { searchMangaDex } from './mangadex'
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
 * Search with fallback: AniList first, then MangaDex if no valid matches.
 * Returns results that meet the confidence threshold from either provider.
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

  // Try AniList first
  const anilistResults = await searchAniList(searchQuery)
  const normalizedAnilist = normalizeAniListResults(anilistResults, cleanedExtractedTitle)
  const validAnilist = normalizedAnilist.filter((r) => r.confidence >= CONFIDENCE_THRESHOLD)

  log.debug(
    'AniList:',
    anilistResults.length,
    'total,',
    validAnilist.length,
    'above threshold'
  )

  if (validAnilist.length > 0) {
    // Sort by confidence descending
    return validAnilist.sort((a, b) => b.confidence - a.confidence)
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
  const validMangadex = normalizedMangadex.filter((r) => r.confidence >= CONFIDENCE_THRESHOLD)

  log.debug(
    'MangaDex:',
    mangadexResults.length,
    'total,',
    validMangadex.length,
    'above threshold'
  )

  if (validMangadex.length > 0) {
    return validMangadex.sort((a, b) => b.confidence - a.confidence)
  }

  // No MangaDex results passed threshold — return top 5 low-confidence results
  if (normalizedMangadex.length > 0) {
    log.info('MangaDex had no valid matches, returning top low-confidence results')
    return normalizedMangadex.sort((a, b) => b.confidence - a.confidence).slice(0, MAX_LOW_CONFIDENCE_RESULTS)
  }

  return []
}
