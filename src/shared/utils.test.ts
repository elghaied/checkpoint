import { describe, it, expect } from 'vitest'
import { cleanSearchQuery, getFormat, getFormatFromLanguage, getFormatFromCountry, mapComickStatus } from './utils'

describe('cleanSearchQuery', () => {
  it('removes individual noise words', () => {
    expect(cleanSearchQuery('Solo Leveling manga')).toBe('Solo Leveling')
    expect(cleanSearchQuery('read Tower of God online')).toBe('Tower of God')
    expect(cleanSearchQuery('One Piece chapter')).toBe('One Piece')
    expect(cleanSearchQuery('Berserk scans')).toBe('Berserk')
    expect(cleanSearchQuery('Vinland Saga raw')).toBe('Vinland Saga')
  })

  it('removes multiple noise words', () => {
    expect(cleanSearchQuery('read manga free online')).toBe('')
    expect(cleanSearchQuery('Solo Leveling manhwa free read online')).toBe('Solo Leveling')
  })

  it('strips domain-like suffixes after separator', () => {
    expect(cleanSearchQuery('Solo Leveling - mangadex.org')).toBe('Solo Leveling')
    expect(cleanSearchQuery('Tower of God | webtoon.com')).toBe('Tower of God')
    expect(cleanSearchQuery('Berserk - site.net')).toBe('Berserk')
    expect(cleanSearchQuery('One Piece - manga.cc')).toBe('One Piece')
  })

  it('strips orphaned separators at end', () => {
    expect(cleanSearchQuery('Solo Leveling -')).toBe('Solo Leveling')
    expect(cleanSearchQuery('Tower of God |')).toBe('Tower of God')
    expect(cleanSearchQuery('Berserk - 95')).toBe('Berserk')
  })

  it('strips leading separators', () => {
    expect(cleanSearchQuery('- Solo Leveling')).toBe('Solo Leveling')
    expect(cleanSearchQuery('| Tower of God')).toBe('Tower of God')
  })

  it('handles empty string', () => {
    expect(cleanSearchQuery('')).toBe('')
  })

  it('returns empty string when all words are noise words', () => {
    expect(cleanSearchQuery('manga manhwa manhua')).toBe('')
    expect(cleanSearchQuery('read online free')).toBe('')
    expect(cleanSearchQuery('chapter chapters scan scans raw raws')).toBe('')
  })

  it('preserves title when there are no noise words', () => {
    expect(cleanSearchQuery('Attack on Titan')).toBe('Attack on Titan')
    expect(cleanSearchQuery('Demon Slayer')).toBe('Demon Slayer')
  })

  it('collapses extra whitespace', () => {
    expect(cleanSearchQuery('Solo  Leveling  manga')).toBe('Solo Leveling')
  })

  it('is case-insensitive for noise word removal', () => {
    expect(cleanSearchQuery('Solo Leveling MANGA')).toBe('Solo Leveling')
    expect(cleanSearchQuery('Solo Leveling Manga')).toBe('Solo Leveling')
    expect(cleanSearchQuery('Solo Leveling READ ONLINE')).toBe('Solo Leveling')
  })

  it('does not remove noise words that are substrings of other words', () => {
    // "scan" should not match inside "scanner"
    expect(cleanSearchQuery('Scanner')).toBe('Scanner')
    // "raw" should not match inside "drawing"
    expect(cleanSearchQuery('Drawing')).toBe('Drawing')
  })

  it('handles combined domain and noise word removal', () => {
    expect(cleanSearchQuery('Solo Leveling manga - mangaplus.com')).toBe('Solo Leveling')
  })
})

describe('getFormat', () => {
  it('returns MANGA for JP', () => {
    expect(getFormat('JP')).toBe('MANGA')
  })

  it('returns MANHWA for KR', () => {
    expect(getFormat('KR')).toBe('MANHWA')
  })

  it('returns MANHUA for CN', () => {
    expect(getFormat('CN')).toBe('MANHUA')
  })

  it('returns MANHUA for TW', () => {
    expect(getFormat('TW')).toBe('MANHUA')
  })

  it('returns MANGA for null', () => {
    expect(getFormat(null)).toBe('MANGA')
  })

  it('returns MANGA for unknown country codes', () => {
    expect(getFormat('US')).toBe('MANGA')
    expect(getFormat('FR')).toBe('MANGA')
    expect(getFormat('')).toBe('MANGA')
    expect(getFormat('XX')).toBe('MANGA')
  })
})

describe('getFormatFromLanguage', () => {
  it('returns MANGA for ja', () => {
    expect(getFormatFromLanguage('ja')).toBe('MANGA')
  })

  it('returns MANHWA for ko', () => {
    expect(getFormatFromLanguage('ko')).toBe('MANHWA')
  })

  it('returns MANHUA for zh', () => {
    expect(getFormatFromLanguage('zh')).toBe('MANHUA')
  })

  it('returns MANHUA for zh-hk', () => {
    expect(getFormatFromLanguage('zh-hk')).toBe('MANHUA')
  })

  it('returns MANGA for unknown language codes', () => {
    expect(getFormatFromLanguage('en')).toBe('MANGA')
    expect(getFormatFromLanguage('fr')).toBe('MANGA')
    expect(getFormatFromLanguage('')).toBe('MANGA')
  })

  it('returns MANHUA for zh-tw (consistent with getFormat("TW"))', () => {
    expect(getFormatFromLanguage('zh-tw')).toBe('MANHUA')
  })
})

describe('getFormatFromCountry', () => {
  it('returns MANGA for jp', () => {
    expect(getFormatFromCountry('jp')).toBe('MANGA')
  })
  it('returns MANHWA for kr', () => {
    expect(getFormatFromCountry('kr')).toBe('MANHWA')
  })
  it('returns MANHUA for cn', () => {
    expect(getFormatFromCountry('cn')).toBe('MANHUA')
  })
  it('returns MANHUA for tw', () => {
    expect(getFormatFromCountry('tw')).toBe('MANHUA')
  })
  it('returns MANGA for unknown country codes', () => {
    expect(getFormatFromCountry('us')).toBe('MANGA')
    expect(getFormatFromCountry('')).toBe('MANGA')
  })
})

describe('mapComickStatus', () => {
  it('maps 1 to RELEASING', () => {
    expect(mapComickStatus(1)).toBe('RELEASING')
  })
  it('maps 2 to FINISHED', () => {
    expect(mapComickStatus(2)).toBe('FINISHED')
  })
  it('maps 3 to CANCELLED', () => {
    expect(mapComickStatus(3)).toBe('CANCELLED')
  })
  it('maps 4 to HIATUS', () => {
    expect(mapComickStatus(4)).toBe('HIATUS')
  })
  it('returns null for unknown status', () => {
    expect(mapComickStatus(0)).toBeNull()
    expect(mapComickStatus(99)).toBeNull()
  })
})
