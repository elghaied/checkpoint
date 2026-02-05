import type { TrackedItem } from './types'

export type MediaFormat = TrackedItem['format']

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
