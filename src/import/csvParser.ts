import Papa from 'papaparse'

export interface ParsedRow {
  csvTitle: string
  csvChapter: string | null
  csvUrl: string | null
  csvTags: string[]
}

export interface CsvSummary {
  totalRows: number
  withChapters: number
  withUrls: number
  withTags: number
}

export type ParseResult =
  | { success: true; rows: ParsedRow[]; summary: CsvSummary }
  | { success: false; error: 'empty_file' | 'missing_title_column'; availableColumns?: string[] }

interface ParseOptions {
  titleColumn?: string
}

const TITLE_ALIASES = ['title']
const CHAPTER_ALIASES = ['ch', 'chapter']
const URL_ALIASES = ['url', 'link']
const TAG_ALIASES = ['tags', 'tag']

function findColumn(headers: string[], aliases: string[]): string | null {
  const lowerAliases = aliases.map((a) => a.toLowerCase())
  return headers.find((h) => lowerAliases.includes(h.toLowerCase().trim())) ?? null
}

function extractChapter(raw: string | undefined | null): string | null {
  if (!raw || !raw.trim()) return null
  const match = raw.match(/(\d+(?:\.\d+)?)/)
  return match ? match[1] : null
}

function parseTags(raw: string | undefined | null): string[] {
  if (!raw || !raw.trim()) return []
  const tags = raw.split(',').map((t) => t.trim()).filter(Boolean)
  const seen = new Map<string, string>()
  for (const tag of tags) {
    const lower = tag.toLowerCase()
    if (!seen.has(lower)) {
      seen.set(lower, tag)
    }
  }
  return Array.from(seen.values())
}

export function parseCSV(csvText: string, options?: ParseOptions): ParseResult {
  if (!csvText || !csvText.trim()) {
    return { success: false, error: 'empty_file' }
  }

  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header: string) => header.trim(),
  })

  if (!parsed.data.length || !parsed.meta.fields?.length) {
    return { success: false, error: 'empty_file' }
  }

  const headers = parsed.meta.fields

  const titleCol = options?.titleColumn ?? findColumn(headers, TITLE_ALIASES)
  if (!titleCol) {
    return {
      success: false,
      error: 'missing_title_column',
      availableColumns: headers,
    }
  }

  const chapterCol = findColumn(headers, CHAPTER_ALIASES)
  const urlCol = findColumn(headers, URL_ALIASES)
  const tagCol = findColumn(headers, TAG_ALIASES)

  const rows: ParsedRow[] = []

  for (const record of parsed.data) {
    const title = record[titleCol]?.trim()
    if (!title) continue

    const chapter = chapterCol ? extractChapter(record[chapterCol]) : null
    const url = urlCol && record[urlCol]?.trim() ? record[urlCol].trim() : null
    const tags = tagCol ? parseTags(record[tagCol]) : []

    rows.push({ csvTitle: title, csvChapter: chapter, csvUrl: url, csvTags: tags })
  }

  const summary: CsvSummary = {
    totalRows: rows.length,
    withChapters: rows.filter((r) => r.csvChapter !== null).length,
    withUrls: rows.filter((r) => r.csvUrl !== null).length,
    withTags: rows.filter((r) => r.csvTags.length > 0).length,
  }

  return { success: true, rows, summary }
}
