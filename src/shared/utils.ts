import type { TrackedItem } from './types'

export type MediaFormat = TrackedItem['format']

// ---------------------------------------------------------------------------
// Query filtering
// ---------------------------------------------------------------------------

/** Words that negatively impact search results across providers */
const NOISE_WORDS = [
  'manga',
  'manhwa',
  'manhua',
  'free',
  'read',
  'online',
  'chapter',
  'chapters',
  'raw',
  'raws',
  'scan',
  'scans',
]

/**
 * Remove noise words from a search query to improve search results.
 */
export function cleanSearchQuery(query: string): string {
  const pattern = new RegExp(`\\b(${NOISE_WORDS.join('|')})\\b`, 'gi')
  return query.replace(pattern, '').replace(/\s+/g, ' ').trim()
}

// ---------------------------------------------------------------------------
// Format mapping
// ---------------------------------------------------------------------------

/**
 * Derive the reading format from the country of origin reported by AniList.
 *
 *   JP          -> MANGA
 *   KR          -> MANHWA
 *   CN | TW     -> MANHUA
 *   null/other  -> MANGA (safe default)
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

/**
 * Derive format from original language code (used by MangaDex).
 * ja -> MANGA, ko -> MANHWA, zh/zh-hk -> MANHUA
 */
export function getFormatFromLanguage(lang: string): MediaFormat {
  switch (lang) {
    case 'ko':
      return 'MANHWA'
    case 'zh':
    case 'zh-hk':
      return 'MANHUA'
    default:
      return 'MANGA'
  }
}
