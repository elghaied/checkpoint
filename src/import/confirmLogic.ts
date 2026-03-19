import type { ImportRow, PendingReviewList, PendingReviewItem, MatchTier } from '@/shared/importTypes'
import type { TrackedItem, CustomTagRegistry } from '@/shared/types'
import { IMPORT_CONFIDENCE_GREEN, IMPORT_CONFIDENCE_YELLOW } from '@/shared/constants'

export function classifyMatchTier(score: number | null): MatchTier {
  if (score === null) return 'red'
  if (score >= IMPORT_CONFIDENCE_GREEN) return 'green'
  if (score >= IMPORT_CONFIDENCE_YELLOW) return 'yellow'
  return 'red'
}

function getHostname(url: string): string {
  try { return new URL(url).hostname } catch { return url }
}

export function detectDuplicates(rows: ImportRow[], existingItems: TrackedItem[]): ImportRow[] {
  const existingById = new Map(existingItems.map((item) => [item.providerId, item]))
  return rows.map((row) => {
    const match = row.userSelection ?? row.bestMatch
    if (!match) return row
    const existing = existingById.get(match.id)
    if (!existing) return row
    const updated = { ...row, duplicateOf: match.id }
    const importChapter = parseFloat(row.csvChapter ?? '0') || 0
    const existingChapter = parseFloat(existing.progress.value) || 0
    if (importChapter <= existingChapter) return { ...updated, userSkipped: true }
    if (!row.csvUrl) return { ...updated, duplicateConflict: { type: 'higher_chapter_no_url' as const } }
    if (existing.lastUrl && getHostname(row.csvUrl) !== getHostname(existing.lastUrl)) {
      return { ...updated, duplicateConflict: { type: 'different_site' as const, existingUrl: existing.lastUrl, importUrl: row.csvUrl } }
    }
    return updated
  })
}

export function buildPendingReviewList(rows: ImportRow[], importedTiers: Set<string>): PendingReviewList {
  const items: PendingReviewItem[] = rows
    .filter((row) => {
      if (!row.matchTier || importedTiers.has(row.matchTier)) return false
      if (row.userSkipped) return false
      return row.matchTier === 'yellow' || row.matchTier === 'red'
    })
    .map((row) => ({
      csvTitle: row.csvTitle,
      csvChapter: row.csvChapter,
      csvUrl: row.csvUrl,
      csvTags: row.csvTags,
      tier: row.matchTier as 'yellow' | 'red',
      bestMatch: row.userSelection ?? row.bestMatch,
      alternatives: row.alternatives,
      confidenceScore: row.confidenceScore,
    }))
  return { createdAt: Date.now(), lastActivityAt: Date.now(), items }
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function tierToStatus(tier: MatchTier | null): string {
  switch (tier) {
    case 'yellow': return 'possible_match'
    case 'red': return 'no_match'
    default: return 'no_match'
  }
}

export function generateDiagnosticCsv(rows: ImportRow[]): string {
  const header = 'title,ch,url,tags,status,best_match,confidence'
  const lines = rows.map((row) => {
    const match = row.userSelection ?? row.bestMatch
    return [
      csvEscape(row.csvTitle),
      row.csvChapter ?? '',
      row.csvUrl ?? '',
      csvEscape(row.csvTags.join(', ')),
      row.duplicateConflict ? 'conflict' : tierToStatus(row.matchTier),
      match ? csvEscape(match.title.primary) : '',
      row.confidenceScore !== null ? String(row.confidenceScore) : '',
    ].join(',')
  })
  return [header, ...lines].join('\n')
}

export function collectNewTags(rows: ImportRow[], registry: CustomTagRegistry): string[] {
  const existingLower = new Set(Object.keys(registry).map((t) => t.toLowerCase()))
  const newTags = new Map<string, string>()
  for (const row of rows) {
    for (const tag of row.csvTags) {
      const lower = tag.toLowerCase()
      if (!existingLower.has(lower) && !newTags.has(lower)) {
        newTags.set(lower, tag)
      }
    }
  }
  return Array.from(newTags.values())
}
