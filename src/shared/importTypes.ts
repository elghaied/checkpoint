import type { UnifiedSearchResult } from './types'

export type ImportPhase = 'parsed' | 'matching' | 'review' | 'confirmed'
export type MatchStatus = 'pending' | 'matched' | 'failed'
export type MatchTier = 'green' | 'yellow' | 'red'

export type DuplicateConflict =
  | { type: 'higher_chapter_no_url' }
  | { type: 'different_site'; existingUrl: string; importUrl: string }

export interface ImportRow {
  index: number
  csvTitle: string
  csvChapter: string | null
  csvUrl: string | null
  csvTags: string[]
  matchStatus: MatchStatus
  matchTier: MatchTier | null
  bestMatch: UnifiedSearchResult | null
  alternatives: UnifiedSearchResult[]
  confidenceScore: number | null
  duplicateOf: string | null
  duplicateConflict: DuplicateConflict | null
  userSelection: UnifiedSearchResult | null
  userSkipped: boolean
}

export interface ImportSession {
  id: string
  phase: ImportPhase
  createdAt: number
  lastActivityAt: number
  csvSummary: {
    totalRows: number
    withChapters: number
    withUrls: number
    withTags: number
  }
  rows: ImportRow[]
}

export interface PendingReviewItem {
  csvTitle: string
  csvChapter: string | null
  csvUrl: string | null
  csvTags: string[]
  tier: 'yellow' | 'red'
  bestMatch: UnifiedSearchResult | null
  alternatives: UnifiedSearchResult[]
  confidenceScore: number | null
}

export interface PendingReviewList {
  createdAt: number
  lastActivityAt: number
  items: PendingReviewItem[]
}

export interface ImportSearchRateLimited {
  rateLimited: true
  waitMs: number
}
