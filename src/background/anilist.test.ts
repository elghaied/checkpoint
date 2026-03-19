import { describe, it, expect } from 'vitest'
import { normalise, scorePair, collectTitles, matchTitle } from './anilist'
import type { AniListMedia } from '@/shared/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMedia(
  id: number,
  romaji: string,
  english: string | null,
  native: string,
  synonyms: string[] = [],
): AniListMedia {
  return {
    id,
    type: 'MANGA',
    format: 'MANGA',
    title: { romaji, english, native },
    synonyms,
    coverImage: { large: '', medium: '' },
    countryOfOrigin: 'JP',
    status: 'RELEASING',
    chapters: null,
    genres: [],
  }
}

// ---------------------------------------------------------------------------
// normalise
// ---------------------------------------------------------------------------

describe('normalise', () => {
  it('lowercases all characters', () => {
    expect(normalise('SOLO LEVELING')).toBe('solo leveling')
    expect(normalise('Attack On Titan')).toBe('attack on titan')
  })

  it('collapses multiple spaces into one', () => {
    expect(normalise('Solo  Leveling')).toBe('solo leveling')
    expect(normalise('Tower   of   God')).toBe('tower of god')
  })

  it('trims leading and trailing whitespace', () => {
    expect(normalise('  Solo Leveling  ')).toBe('solo leveling')
    expect(normalise('\tBerserk\n')).toBe('berserk')
  })

  it('handles strings with no changes needed', () => {
    expect(normalise('solo leveling')).toBe('solo leveling')
  })

  it('handles empty string', () => {
    expect(normalise('')).toBe('')
  })
})

// ---------------------------------------------------------------------------
// scorePair
// ---------------------------------------------------------------------------

describe('scorePair', () => {
  it('returns 1.0 for exact match', () => {
    expect(scorePair('solo leveling', 'solo leveling')).toBe(1.0)
    expect(scorePair('berserk', 'berserk')).toBe(1.0)
  })

  it('returns 0.9 for prefix match (a starts with b)', () => {
    expect(scorePair('solo leveling the manhwa', 'solo leveling')).toBe(0.9)
  })

  it('returns 0.9 for prefix match (b starts with a)', () => {
    expect(scorePair('solo leveling', 'solo leveling the manhwa')).toBe(0.9)
  })

  it('returns 0.7 for substring match (b inside a)', () => {
    expect(scorePair('the tale of solo leveling', 'solo leveling')).toBe(0.7)
  })

  it('returns 0.7 for substring match (a inside b)', () => {
    expect(scorePair('solo leveling', 'the great solo leveling story')).toBe(0.7)
  })

  it('returns 0.85 for spaceless exact match', () => {
    // "rai rai rai" vs "rairairai" — differ only by spaces
    expect(scorePair('rai rai rai', 'rairairai')).toBe(0.85)
  })

  it('returns 0.8 for spaceless prefix match', () => {
    expect(scorePair('solo leveling', 'sololevelingextra')).toBe(0.8)
  })

  it('returns 0.7 for spaceless substring match (not prefix)', () => {
    // Neither contains the other with spaces, but stripping spaces makes one a substring
    expect(scorePair('the sololeveling tale', 'solo leveling')).toBe(0.7)
  })

  it('returns 0 for no relationship', () => {
    expect(scorePair('attack on titan', 'demon slayer')).toBe(0)
  })

  it('returns 0 for short strings (length < 3)', () => {
    expect(scorePair('ab', 'ab extra string')).toBe(0)
    expect(scorePair('ab', 'abcdef')).toBe(0)
    // The shorter is 'ab' (length 2), so returns 0 even though it's a prefix match
  })

  it('returns 0 for empty string compared to non-empty', () => {
    expect(scorePair('', 'solo leveling')).toBe(0)
  })

  it('returns 0 for empty string pair', () => {
    expect(scorePair('', '')).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// collectTitles
// ---------------------------------------------------------------------------

describe('collectTitles', () => {
  it('always includes romaji title', () => {
    const media = makeMedia(1, 'Solo Leveling', null, '나 혼자만 레벨업')
    const titles = collectTitles(media)
    expect(titles).toContain('Solo Leveling')
  })

  it('includes english title when present', () => {
    const media = makeMedia(1, 'Shingeki no Kyojin', 'Attack on Titan', '進撃の巨人')
    const titles = collectTitles(media)
    expect(titles).toContain('Attack on Titan')
  })

  it('excludes english title when null', () => {
    const media = makeMedia(1, 'Solo Leveling', null, '나 혼자만 레벨업')
    const titles = collectTitles(media)
    expect(titles).not.toContain(null)
    expect(titles.filter((t) => t === null)).toHaveLength(0)
  })

  it('includes native title', () => {
    const media = makeMedia(1, 'Shingeki no Kyojin', 'Attack on Titan', '進撃の巨人')
    const titles = collectTitles(media)
    expect(titles).toContain('進撃の巨人')
  })

  it('includes synonyms', () => {
    const media = makeMedia(1, 'Solo Leveling', null, '나 혼자만 레벨업', ['Only I Level Up', 'I Level Up Alone'])
    const titles = collectTitles(media)
    expect(titles).toContain('Only I Level Up')
    expect(titles).toContain('I Level Up Alone')
  })

  it('romaji appears before synonyms', () => {
    const media = makeMedia(1, 'Solo Leveling', null, '나 혼자만 레벨업', ['Only I Level Up'])
    const titles = collectTitles(media)
    expect(titles[0]).toBe('Solo Leveling')
  })

  it('returns empty synonyms array when no synonyms', () => {
    const media = makeMedia(1, 'Berserk', 'Berserk', 'ベルセルク')
    const titles = collectTitles(media)
    expect(titles.length).toBe(3) // romaji + english + native
  })
})

// ---------------------------------------------------------------------------
// matchTitle
// ---------------------------------------------------------------------------

describe('matchTitle', () => {
  it('returns null for empty media list', () => {
    expect(matchTitle('Solo Leveling', [])).toBeNull()
  })

  it('finds exact match with confidence 1.0', () => {
    const media = makeMedia(1, 'Solo Leveling', 'Solo Leveling', '나 혼자만 레벨업')
    const result = matchTitle('Solo Leveling', [media])
    expect(result).not.toBeNull()
    expect(result!.confidence).toBe(1.0)
    expect(result!.media.id).toBe(1)
  })

  it('is case-insensitive for matching', () => {
    const media = makeMedia(1, 'Solo Leveling', null, '나 혼자만 레벨업')
    const result = matchTitle('solo leveling', [media])
    expect(result).not.toBeNull()
    expect(result!.confidence).toBe(1.0)
  })

  it('matches against english title', () => {
    const media = makeMedia(1, 'Shingeki no Kyojin', 'Attack on Titan', '進撃の巨人')
    const result = matchTitle('Attack on Titan', [media])
    expect(result).not.toBeNull()
    expect(result!.confidence).toBe(1.0)
  })

  it('matches against synonyms', () => {
    const media = makeMedia(1, 'Solo Leveling', null, '나 혼자만 레벨업', ['Only I Level Up'])
    const result = matchTitle('Only I Level Up', [media])
    expect(result).not.toBeNull()
    expect(result!.confidence).toBe(1.0)
  })

  it('returns best match when multiple candidates', () => {
    const media1 = makeMedia(1, 'Solo Leveling Extended Edition', null, '나 혼자만')
    const media2 = makeMedia(2, 'Solo Leveling', null, '나 혼자만 레벨업')
    const result = matchTitle('Solo Leveling', [media1, media2])
    expect(result).not.toBeNull()
    // media2 is an exact match so should score higher than media1 (prefix match)
    expect(result!.media.id).toBe(2)
    expect(result!.confidence).toBe(1.0)
  })

  it('returns null when no media scores above 0', () => {
    const media = makeMedia(1, 'Attack on Titan', 'Attack on Titan', '進撃の巨人')
    const result = matchTitle('Completely Different Title', [media])
    expect(result).toBeNull()
  })

  it('breaks early on perfect match (1.0)', () => {
    // Create a list where the first item is a perfect match
    const media1 = makeMedia(1, 'Solo Leveling', null, '나 혼자만 레벨업')
    const media2 = makeMedia(2, 'Solo Leveling Complete', null, '나 혼자만')
    const result = matchTitle('Solo Leveling', [media1, media2])
    expect(result).not.toBeNull()
    expect(result!.media.id).toBe(1)
    expect(result!.confidence).toBe(1.0)
  })

  it('picks higher confidence match from later in the list', () => {
    const media1 = makeMedia(1, 'Solo Leveling Extended', null, '나 혼자만')
    const media2 = makeMedia(2, 'Solo Leveling', null, '나 혼자만 레벨업')
    const result = matchTitle('Solo Leveling', [media1, media2])
    expect(result).not.toBeNull()
    expect(result!.media.id).toBe(2)
  })
})
