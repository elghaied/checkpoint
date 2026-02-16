import type { AniListMedia, MangaDexMedia, UnifiedSearchResult } from '@/shared/types'
import { cleanSearchQuery, getFormat, getFormatFromLanguage } from '@/shared/utils'
import { searchAniList, collectTitles, normalise, scorePair } from './anilist'
import { searchMangaDex } from './mangadex'

export const CONFIDENCE_THRESHOLD = 0.7

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
  // Clean noise words once before passing to any provider
  const cleanedQuery = cleanSearchQuery(query) || query
  console.log('[searchService] Searching with fallback for:', cleanedQuery, '(original:', query, ', extracted:', extractedTitle, ')')

  // Try AniList first
  const anilistResults = await searchAniList(cleanedQuery)
  const normalizedAnilist = normalizeAniListResults(anilistResults, extractedTitle)
  const validAnilist = normalizedAnilist.filter((r) => r.confidence >= CONFIDENCE_THRESHOLD)

  console.log(
    '[searchService] AniList:',
    anilistResults.length,
    'total,',
    validAnilist.length,
    'above threshold'
  )

  if (validAnilist.length > 0) {
    // Sort by confidence descending
    return validAnilist.sort((a, b) => b.confidence - a.confidence)
  }

  // Fallback to MangaDex
  console.log('[searchService] AniList had no valid matches, trying MangaDex')
  const mangadexResults = await searchMangaDex(cleanedQuery)
  const normalizedMangadex = normalizeMangaDexResults(mangadexResults, extractedTitle)
  const validMangadex = normalizedMangadex.filter((r) => r.confidence >= CONFIDENCE_THRESHOLD)

  console.log(
    '[searchService] MangaDex:',
    mangadexResults.length,
    'total,',
    validMangadex.length,
    'above threshold'
  )

  // Sort by confidence descending
  return validMangadex.sort((a, b) => b.confidence - a.confidence)
}
