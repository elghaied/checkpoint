import { describe, it, expect } from 'vitest'
import { parseCSV, type ParseResult } from './csvParser'

describe('parseCSV', () => {
  it('parses basic CSV with title column', () => {
    const csv = 'title,ch,url\nOne Piece,1120,https://example.com\nNaruto,700,'
    const result = parseCSV(csv)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0]).toEqual({
      csvTitle: 'One Piece',
      csvChapter: '1120',
      csvUrl: 'https://example.com',
      csvTags: [],
    })
    expect(result.rows[1]).toEqual({
      csvTitle: 'Naruto',
      csvChapter: '700',
      csvUrl: null,
      csvTags: [],
    })
  })

  it('detects missing title column and returns available columns', () => {
    const csv = 'name,chapter,link\nOne Piece,1120,https://example.com'
    const result = parseCSV(csv)
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('missing_title_column')
    expect(result.availableColumns).toContain('name')
  })

  it('supports column remapping', () => {
    const csv = 'name,chapter\nOne Piece,1120'
    const result = parseCSV(csv, { titleColumn: 'name' })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.rows[0].csvTitle).toBe('One Piece')
  })

  it('handles case-insensitive column names', () => {
    const csv = 'Title,CH,URL,Tags\nOne Piece,1120,https://x.com,"action, adventure"'
    const result = parseCSV(csv)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.rows[0].csvTitle).toBe('One Piece')
    expect(result.rows[0].csvChapter).toBe('1120')
    expect(result.rows[0].csvUrl).toBe('https://x.com')
    expect(result.rows[0].csvTags).toEqual(['action', 'adventure'])
  })

  it('extracts numeric chapter from text', () => {
    const csv = 'title,ch\nOne Piece,ch 45\nNaruto,latest\nBleach,100.5'
    const result = parseCSV(csv)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.rows[0].csvChapter).toBe('45')
    expect(result.rows[1].csvChapter).toBe(null)
    expect(result.rows[2].csvChapter).toBe('100.5')
  })

  it('parses comma-separated tags', () => {
    const csv = 'title,tags\nOne Piece,"isekai, romance, completed"'
    const result = parseCSV(csv)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.rows[0].csvTags).toEqual(['isekai', 'romance', 'completed'])
  })

  it('deduplicates tags per row', () => {
    const csv = 'title,tags\nOne Piece,"action, Action, ACTION"'
    const result = parseCSV(csv)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.rows[0].csvTags).toHaveLength(1)
  })

  it('skips rows with empty titles', () => {
    const csv = 'title,ch\nOne Piece,100\n,50\n  ,30\nNaruto,200'
    const result = parseCSV(csv)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.rows).toHaveLength(2)
  })

  it('handles UTF-8 BOM', () => {
    const csv = '\uFEFFtitle,ch\nOne Piece,100'
    const result = parseCSV(csv)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.rows[0].csvTitle).toBe('One Piece')
  })

  it('handles empty file', () => {
    const result = parseCSV('')
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('empty_file')
  })

  it('generates correct summary', () => {
    const csv = 'title,ch,url,tags\nA,1,https://x.com,"tag1"\nB,,,""\nC,3,,tag2'
    const result = parseCSV(csv)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.summary).toEqual({
      totalRows: 3,
      withChapters: 2,
      withUrls: 1,
      withTags: 2,
    })
  })

  it('recognizes alternate column names (chapter, link, tag)', () => {
    const csv = 'title,chapter,link,tag\nOne Piece,100,https://x.com,action'
    const result = parseCSV(csv)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.rows[0].csvChapter).toBe('100')
    expect(result.rows[0].csvUrl).toBe('https://x.com')
    expect(result.rows[0].csvTags).toEqual(['action'])
  })

  it('ignores unrecognized columns silently', () => {
    const csv = 'title,ch,status,best_match,confidence\nOne Piece,100,no_match,One Piece,0.3'
    const result = parseCSV(csv)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.rows[0].csvTitle).toBe('One Piece')
    expect(result.rows[0].csvChapter).toBe('100')
  })
})
