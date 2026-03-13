import { describe, it, expect } from 'vitest'
import { cleanTitle, extractChapter } from './metadata'

// ---------------------------------------------------------------------------
// cleanTitle
// ---------------------------------------------------------------------------

describe('cleanTitle', () => {
  it('returns null for empty string', () => {
    expect(cleanTitle('')).toBeNull()
  })

  it('returns the title unchanged when no chapter or site patterns match', () => {
    expect(cleanTitle('Attack on Titan')).toBe('Attack on Titan')
    expect(cleanTitle('Solo Leveling')).toBe('Solo Leveling')
  })

  // Chapter pattern removal
  it('removes "- Chapter N" suffix (with dash separator)', () => {
    expect(cleanTitle('Solo Leveling - Chapter 95')).toBe('Solo Leveling')
    expect(cleanTitle('Solo Leveling - Chapter 95.5')).toBe('Solo Leveling')
  })

  it('removes "| Chapter N" suffix (with pipe separator)', () => {
    expect(cleanTitle('Berserk | Chapter 370')).toBe('Berserk')
  })

  it('removes ": Chapter N" suffix (with colon separator)', () => {
    expect(cleanTitle('Tower of God: Chapter 580')).toBe('Tower of God')
  })

  it('removes "Chapter N" suffix (with leading space only)', () => {
    expect(cleanTitle('Attack on Titan Chapter 139')).toBe('Attack on Titan')
  })

  it('removes "- Ch. N" suffix', () => {
    expect(cleanTitle('One Piece - Ch. 1089')).toBe('One Piece')
    expect(cleanTitle('One Piece - Ch 1089')).toBe('One Piece')
  })

  it('removes "Ch. N" suffix (with leading space)', () => {
    expect(cleanTitle('Demon Slayer Ch. 205')).toBe('Demon Slayer')
  })

  it('removes "Episode N" suffix', () => {
    expect(cleanTitle('Noblesse Episode 524')).toBe('Noblesse')
  })

  it('removes "Ep. N" suffix', () => {
    expect(cleanTitle('Omniscient Reader Ep. 100')).toBe('Omniscient Reader')
    expect(cleanTitle('Omniscient Reader Ep 100')).toBe('Omniscient Reader')
  })

  it('removes "#N" suffix', () => {
    expect(cleanTitle('My Hero Academia #1')).toBe('My Hero Academia')
    expect(cleanTitle('Solo Leveling #95')).toBe('Solo Leveling')
  })

  it('is case-insensitive for chapter patterns', () => {
    expect(cleanTitle('Solo Leveling - CHAPTER 95')).toBe('Solo Leveling')
    expect(cleanTitle('Solo Leveling - chapter 95')).toBe('Solo Leveling')
  })

  // Site suffix removal
  it('removes "- MangaDex" suffix', () => {
    expect(cleanTitle('Berserk - MangaDex')).toBe('Berserk')
  })

  it('removes "- Webtoon" suffix', () => {
    expect(cleanTitle('Tower of God - Webtoon')).toBe('Tower of God')
  })

  it('removes "- Manga" suffix', () => {
    expect(cleanTitle('One Piece - Manga')).toBe('One Piece')
  })

  it('removes "- Read Online" suffix', () => {
    expect(cleanTitle('Attack on Titan - Read Online')).toBe('Attack on Titan')
  })

  it('removes "- Read Free" suffix', () => {
    expect(cleanTitle('Solo Leveling - Read Free')).toBe('Solo Leveling')
  })

  it('removes domain-like suffixes', () => {
    expect(cleanTitle('Solo Leveling - mangaplus.com')).toBe('Solo Leveling')
    expect(cleanTitle('Berserk | site.net')).toBe('Berserk')
  })

  it('trims whitespace after removal', () => {
    expect(cleanTitle('  Solo Leveling - Chapter 95  ')).toBe('Solo Leveling')
  })

  it('returns null when title becomes empty after removal', () => {
    // If only the chapter indicator remains after stripping, result is null
    expect(cleanTitle('   ')).toBeNull()
  })

  it('removes trailing text after chapter number', () => {
    expect(cleanTitle('Solo Leveling - Chapter 95 - Awakening')).toBe('Solo Leveling')
  })
})

// ---------------------------------------------------------------------------
// extractChapter
// ---------------------------------------------------------------------------

describe('extractChapter', () => {
  it('returns null when no chapter pattern matches', () => {
    expect(extractChapter('Solo Leveling')).toBeNull()
    expect(extractChapter('')).toBeNull()
    expect(extractChapter('Some random text')).toBeNull()
  })

  // "chapter N" pattern
  it('extracts chapter number from "chapter N" pattern', () => {
    expect(extractChapter('chapter 95')).toBe('95')
    expect(extractChapter('Chapter 95')).toBe('95')
    expect(extractChapter('CHAPTER 95')).toBe('95')
  })

  it('extracts decimal chapter number from "chapter N.M" pattern', () => {
    expect(extractChapter('chapter 95.5')).toBe('95.5')
  })

  it('handles "chapter" with spaces before number', () => {
    expect(extractChapter('chapter  42')).toBe('42')
  })

  // "ch. N" / "ch N" pattern
  it('extracts chapter number from "ch. N" pattern', () => {
    expect(extractChapter('ch. 1089')).toBe('1089')
    expect(extractChapter('ch 1089')).toBe('1089')
    expect(extractChapter('Ch. 1089')).toBe('1089')
  })

  it('extracts decimal chapter number from "ch. N.M" pattern', () => {
    expect(extractChapter('ch. 95.5')).toBe('95.5')
  })

  // "ep / episode N" pattern
  it('extracts chapter number from "ep N" pattern', () => {
    expect(extractChapter('ep 10')).toBe('10')
    expect(extractChapter('ep. 10')).toBe('10')
  })

  it('extracts chapter number from "episode N" pattern', () => {
    expect(extractChapter('episode 42')).toBe('42')
    expect(extractChapter('Episode 42')).toBe('42')
  })

  // "#N" pattern
  it('extracts chapter number from "#N" pattern', () => {
    expect(extractChapter('#95')).toBe('95')
    expect(extractChapter('#1')).toBe('1')
  })

  it('extracts decimal from "#N.M" pattern', () => {
    expect(extractChapter('#95.5')).toBe('95.5')
  })

  // URL patterns — the regex matches /chapter-N, /ch-N, /c-N style only
  it('extracts chapter from URL "/chapter-N" style', () => {
    expect(extractChapter('/chapter-95')).toBe('95')
  })

  it('extracts chapter from URL "/ch-N" style', () => {
    expect(extractChapter('/ch-42')).toBe('42')
  })

  it('extracts chapter from URL "/c-N" style', () => {
    expect(extractChapter('/c-99')).toBe('99')
  })

  it('is case-insensitive for URL chapter patterns', () => {
    expect(extractChapter('/Chapter-95')).toBe('95')
    expect(extractChapter('/CHAPTER-95')).toBe('95')
  })

  it('returns first match when multiple patterns could match', () => {
    // "chapter" keyword pattern matches before URL pattern
    expect(extractChapter('chapter 5 /ch/10')).toBe('5')
  })

  it('extracts chapter number from realistic page title', () => {
    expect(extractChapter('Solo Leveling - Chapter 95')).toBe('95')
    expect(extractChapter('One Piece Ch. 1089 - MangaDex')).toBe('1089')
  })

  it('extracts chapter number from realistic URL with "chapter" keyword in text', () => {
    // The "chapter" keyword pattern matches before the URL slash pattern
    expect(extractChapter('reading chapter 1089 now')).toBe('1089')
  })
})
