# CSV Bulk Import — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a CSV bulk import feature that lets users import hundreds of manga/manhwa/manhua titles via a dedicated browser tab with Parse → Match → Review → Confirm workflow.

**Architecture:** Import tab (4th Vite entry point) drives the batch search loop. Background service worker executes searches via `IMPORT_SEARCH` message with built-in rate limiting. Session state persists in `chrome.storage.local` under dedicated keys (`importSession`, `pendingReview`). Side panel shows awareness banners via `chrome.storage.onChanged`.

**Tech Stack:** React 19, TypeScript, Vite (multi-page), PapaParse, Chrome Extension APIs (MV3), Vitest

**Spec:** `specs/2026-03-19-csv-bulk-import-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `src/shared/importTypes.ts` | Import-specific types (`ImportSession`, `ImportRow`, `PendingReviewList`, etc.) |
| `src/shared/tagColors.ts` | Extracted `getNextColor()` logic (shared between side panel and import tab) |
| `src/background/rateLimiter.ts` | Sliding window rate limiter for API calls |
| `src/background/rateLimiter.test.ts` | Rate limiter tests |
| `src/import/csvParser.ts` | CSV parsing, column detection, validation |
| `src/import/csvParser.test.ts` | CSV parser tests |
| `src/import/confirmLogic.ts` | Pure functions: tier grouping, duplicate detection, pending review creation, CSV export |
| `src/import/confirmLogic.test.ts` | Confirm logic tests |
| `src/import/index.html` | Import tab HTML entry point |
| `src/import/main.tsx` | React entry point |
| `src/import/App.tsx` | Phase router (parse → match → review → confirm) |
| `src/import/services/messaging.ts` | Import-tab messaging wrapper (IMPORT_SEARCH, SAVE_ITEM, etc.) |
| `src/import/hooks/useImportSession.ts` | Load/save/clear import session from storage |
| `src/import/hooks/useBatchMatcher.ts` | Batch search orchestrator with pause/resume |
| `src/import/components/FileUpload.tsx` | File picker + validation summary + row preview |
| `src/import/components/MatchProgress.tsx` | Progress bar, running tally, pause/resume controls |
| `src/import/components/ReviewTable.tsx` | Sortable/filterable results data table |
| `src/import/components/SimilarModal.tsx` | Match selection modal with in-modal search |
| `src/import/components/ConfirmPanel.tsx` | Tier checkboxes, import execution, completion screen |
| `src/import/styles/import.module.css` | Import tab styles |
| `src/sidepanel/hooks/usePendingReview.ts` | Pending review banner state for side panel |
| `src/sidepanel/components/ImportBanner.tsx` | Import session / pending review banner |

### Modified Files

| File | Changes |
|------|---------|
| `src/shared/types.ts` | Add `IMPORT_SEARCH` and `IMPORT_STATUS` to `MessageRequest` union |
| `src/shared/constants.ts` | Add import-specific constants (thresholds, storage keys, batch size) |
| `src/background/index.ts` | Add `IMPORT_SEARCH` and `IMPORT_STATUS` case handlers |
| `src/background/chapterChecker.ts` | Check `importActive` flag before running alarm |
| `src/sidepanel/hooks/useCustomTags.ts` | Import `getNextColor` from shared `tagColors.ts` instead of inline |
| `src/sidepanel/App.tsx` | Render `ImportBanner` component |
| `src/sidepanel/components/SettingsPage.tsx` | Add "Import from CSV" button |
| `vite.config.ts` | Add import entry point, update `copySidepanelHtml` plugin |
| `public/manifest.json` | Add `unlimitedStorage` permission |
| `package.json` | Add `papaparse` dependency |

---

## Task 1: Types, Constants & Manifest

**Files:**
- Create: `src/shared/importTypes.ts`
- Modify: `src/shared/types.ts`
- Modify: `src/shared/constants.ts`
- Modify: `public/manifest.json`
- Modify: `package.json`

- [ ] **Step 1: Create import-specific types**

Create `src/shared/importTypes.ts`:

```typescript
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
```

- [ ] **Step 2: Add new message types to MessageRequest union**

In `src/shared/types.ts`, add to the `MessageRequest` union (after the `DELETE_LIST` line):

```typescript
  // CSV Import
  | { type: 'IMPORT_SEARCH'; query: string; extractedTitle: string }
  | { type: 'IMPORT_STATUS'; active: boolean }
```

- [ ] **Step 3: Add import constants**

In `src/shared/constants.ts`, add at the end:

```typescript
// CSV Import
export const IMPORT_CONFIDENCE_GREEN = 0.85
export const IMPORT_CONFIDENCE_YELLOW = 0.50
export const IMPORT_BATCH_CHECKPOINT_SIZE = 10
export const IMPORT_RATE_LIMIT_PER_MINUTE = 75
export const IMPORT_SESSION_KEY = 'importSession'
export const PENDING_REVIEW_KEY = 'pendingReview'
export const PENDING_REVIEW_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000 // 30 days
```

- [ ] **Step 4: Update manifest.json**

In `public/manifest.json`, add `"unlimitedStorage"` to the `permissions` array.

- [ ] **Step 5: Install PapaParse**

Run: `npm install papaparse && npm install -D @types/papaparse`

- [ ] **Step 6: Run typecheck to verify types compile**

Run: `npm run typecheck`
Expected: PASS (no errors)

- [ ] **Step 7: Commit**

```bash
git add src/shared/importTypes.ts src/shared/types.ts src/shared/constants.ts public/manifest.json package.json package-lock.json
git commit -m "feat(import): add import types, constants, and manifest changes"
```

---

## Task 2: Rate Limiter (TDD)

**Files:**
- Create: `src/background/rateLimiter.ts`
- Test: `src/background/rateLimiter.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/background/rateLimiter.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { RateLimiter } from './rateLimiter'

describe('RateLimiter', () => {
  let limiter: RateLimiter

  beforeEach(() => {
    limiter = new RateLimiter(75) // 75 requests per minute
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('allows requests within budget', () => {
    const result = limiter.tryAcquire()
    expect(result).toEqual({ allowed: true })
  })

  it('rejects requests when budget exhausted', () => {
    for (let i = 0; i < 75; i++) {
      limiter.tryAcquire()
    }
    const result = limiter.tryAcquire()
    expect(result.allowed).toBe(false)
    expect('waitMs' in result && result.waitMs).toBeGreaterThan(0)
  })

  it('allows requests after window expires', () => {
    for (let i = 0; i < 75; i++) {
      limiter.tryAcquire()
    }
    // Advance past the 60-second window
    vi.advanceTimersByTime(61_000)
    const result = limiter.tryAcquire()
    expect(result).toEqual({ allowed: true })
  })

  it('slides window correctly — old timestamps expire', () => {
    // Use 40 requests
    for (let i = 0; i < 40; i++) {
      limiter.tryAcquire()
    }
    // Advance 30 seconds
    vi.advanceTimersByTime(30_000)
    // Use 35 more (total 75 in window, but first 40 are 30s old)
    for (let i = 0; i < 35; i++) {
      limiter.tryAcquire()
    }
    // Should be at budget limit now (75 in last 60s)
    const blocked = limiter.tryAcquire()
    expect(blocked.allowed).toBe(false)

    // Advance 31 more seconds — first 40 fall out of window
    vi.advanceTimersByTime(31_000)
    const allowed = limiter.tryAcquire()
    expect(allowed).toEqual({ allowed: true })
  })

  it('records timestamp on successful acquire', () => {
    limiter.tryAcquire()
    // Can still make 74 more
    for (let i = 0; i < 74; i++) {
      expect(limiter.tryAcquire().allowed).toBe(true)
    }
    expect(limiter.tryAcquire().allowed).toBe(false)
  })

  it('calculates correct waitMs when rejected', () => {
    const start = Date.now()
    for (let i = 0; i < 75; i++) {
      limiter.tryAcquire()
    }
    const result = limiter.tryAcquire()
    if (!result.allowed) {
      // waitMs should be roughly 60000 (time until first timestamp expires)
      expect(result.waitMs).toBeGreaterThan(0)
      expect(result.waitMs).toBeLessThanOrEqual(60_000)
    }
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/background/rateLimiter.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement rate limiter**

Create `src/background/rateLimiter.ts`:

```typescript
type AcquireResult =
  | { allowed: true }
  | { allowed: false; waitMs: number }

const WINDOW_MS = 60_000

export class RateLimiter {
  private timestamps: number[] = []
  private maxPerWindow: number

  constructor(maxPerMinute: number) {
    this.maxPerWindow = maxPerMinute
  }

  tryAcquire(): AcquireResult {
    const now = Date.now()
    this.prune(now)

    if (this.timestamps.length < this.maxPerWindow) {
      this.timestamps.push(now)
      return { allowed: true }
    }

    const oldest = this.timestamps[0]
    const waitMs = oldest + WINDOW_MS - now
    return { allowed: false, waitMs: Math.max(1, waitMs) }
  }

  private prune(now: number): void {
    const cutoff = now - WINDOW_MS
    while (this.timestamps.length > 0 && this.timestamps[0] <= cutoff) {
      this.timestamps.shift()
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/background/rateLimiter.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: All existing + new tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/background/rateLimiter.ts src/background/rateLimiter.test.ts
git commit -m "feat(import): add sliding window rate limiter with tests"
```

---

## Task 3: CSV Parser (TDD)

**Files:**
- Create: `src/import/csvParser.ts`
- Test: `src/import/csvParser.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/import/csvParser.test.ts`:

```typescript
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
    // Keeps first occurrence casing
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/import/csvParser.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement CSV parser**

Create `src/import/csvParser.ts`:

```typescript
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
  // Try to extract a number (integer or decimal)
  const match = raw.match(/(\d+(?:\.\d+)?)/)
  return match ? match[1] : null
}

function parseTags(raw: string | undefined | null): string[] {
  if (!raw || !raw.trim()) return []
  const tags = raw.split(',').map((t) => t.trim()).filter(Boolean)
  // Deduplicate case-insensitively, keeping first occurrence
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

  // Find column mappings
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/import/csvParser.test.ts`
Expected: All 12 tests PASS

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/import/csvParser.ts src/import/csvParser.test.ts
git commit -m "feat(import): add CSV parser with column detection and validation"
```

---

## Task 4: Confirm Logic & Tag Color Extraction (TDD)

**Files:**
- Create: `src/shared/tagColors.ts`
- Create: `src/import/confirmLogic.ts`
- Test: `src/import/confirmLogic.test.ts`
- Modify: `src/sidepanel/hooks/useCustomTags.ts`

- [ ] **Step 1: Extract getNextColor to shared utility**

Create `src/shared/tagColors.ts`:

```typescript
import { TAG_COLORS } from './constants'
import type { CustomTagRegistry } from './types'

/**
 * Returns the next color in the palette based on how many tags exist.
 * Cycles through TAG_COLORS array.
 */
export function getNextTagColor(existingTags: CustomTagRegistry): string {
  const usedCount = Object.keys(existingTags).length
  return TAG_COLORS[usedCount % TAG_COLORS.length]
}
```

- [ ] **Step 2: Update useCustomTags to use shared utility**

In `src/sidepanel/hooks/useCustomTags.ts`, replace the inline `getNextColor`:

Change the import to include `getNextTagColor`:
```typescript
import { getNextTagColor } from '@/shared/tagColors'
```

Replace the `getNextColor` callback body:
```typescript
const getNextColor = useCallback((): string => {
  return getNextTagColor(tags)
}, [tags])
```

- [ ] **Step 3: Run existing tests to verify no regression**

Run: `npm test`
Expected: All tests PASS

- [ ] **Step 4: Write failing tests for confirm logic**

Create `src/import/confirmLogic.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  classifyMatchTier,
  detectDuplicates,
  buildPendingReviewList,
  generateDiagnosticCsv,
  collectNewTags,
} from './confirmLogic'
import type { ImportRow } from '@/shared/importTypes'
import type { TrackedItem, CustomTagRegistry } from '@/shared/types'
import { IMPORT_CONFIDENCE_GREEN, IMPORT_CONFIDENCE_YELLOW } from '@/shared/constants'

function makeRow(overrides: Partial<ImportRow> = {}): ImportRow {
  return {
    index: 0,
    csvTitle: 'Test Title',
    csvChapter: null,
    csvUrl: null,
    csvTags: [],
    matchStatus: 'pending',
    matchTier: null,
    bestMatch: null,
    alternatives: [],
    confidenceScore: null,
    duplicateOf: null,
    duplicateConflict: null,
    userSelection: null,
    userSkipped: false,
    ...overrides,
  }
}

function makeTrackedItem(overrides: Partial<TrackedItem> = {}): TrackedItem {
  return {
    provider: 'anilist',
    providerId: 'test-id',
    mediaType: 'manga',
    format: 'MANGA',
    titles: { main: 'Test', alt: [] },
    coverImage: '',
    progress: { unit: 'chapter', value: '0' },
    lastUrl: '',
    updatedAt: Date.now(),
    createdAt: Date.now(),
    chaptersWhenAdded: null,
    latestKnownChapters: null,
    lastApiCheck: null,
    notificationsEnabled: true,
    anilistStatus: null,
    genres: [],
    tags: [],
    genresBackfilled: false,
    ...overrides,
  }
}

describe('classifyMatchTier', () => {
  it('returns green for score >= 0.85', () => {
    expect(classifyMatchTier(0.85)).toBe('green')
    expect(classifyMatchTier(0.99)).toBe('green')
  })

  it('returns yellow for score 0.50-0.84', () => {
    expect(classifyMatchTier(0.50)).toBe('yellow')
    expect(classifyMatchTier(0.84)).toBe('yellow')
  })

  it('returns red for score < 0.50', () => {
    expect(classifyMatchTier(0.49)).toBe('red')
    expect(classifyMatchTier(0)).toBe('red')
  })

  it('returns red for null score', () => {
    expect(classifyMatchTier(null)).toBe('red')
  })
})

describe('detectDuplicates', () => {
  it('marks duplicate when providerId matches existing item', () => {
    const rows = [makeRow({
      bestMatch: { id: 'anilist-123', provider: 'anilist' } as any,
      csvChapter: '200',
      csvUrl: 'https://site.com/ch200',
    })]
    const existing = [makeTrackedItem({
      providerId: 'anilist-123',
      progress: { unit: 'chapter', value: '100' },
      lastUrl: 'https://site.com/ch100',
    })]

    const result = detectDuplicates(rows, existing)
    expect(result[0].duplicateOf).toBe('anilist-123')
    expect(result[0].duplicateConflict).toBeNull() // higher ch + has URL = no conflict
  })

  it('flags conflict when higher chapter but no URL', () => {
    const rows = [makeRow({
      bestMatch: { id: 'anilist-123', provider: 'anilist' } as any,
      csvChapter: '200',
      csvUrl: null,
    })]
    const existing = [makeTrackedItem({
      providerId: 'anilist-123',
      progress: { unit: 'chapter', value: '100' },
    })]

    const result = detectDuplicates(rows, existing)
    expect(result[0].duplicateConflict).toEqual({ type: 'higher_chapter_no_url' })
  })

  it('flags conflict when URL is from different site', () => {
    const rows = [makeRow({
      bestMatch: { id: 'anilist-123', provider: 'anilist' } as any,
      csvChapter: '200',
      csvUrl: 'https://newsite.com/ch200',
    })]
    const existing = [makeTrackedItem({
      providerId: 'anilist-123',
      progress: { unit: 'chapter', value: '100' },
      lastUrl: 'https://oldsite.com/ch100',
    })]

    const result = detectDuplicates(rows, existing)
    expect(result[0].duplicateConflict).toEqual({
      type: 'different_site',
      existingUrl: 'https://oldsite.com/ch100',
      importUrl: 'https://newsite.com/ch200',
    })
  })

  it('skips silently when existing has same or higher chapter', () => {
    const rows = [makeRow({
      bestMatch: { id: 'anilist-123', provider: 'anilist' } as any,
      csvChapter: '50',
    })]
    const existing = [makeTrackedItem({
      providerId: 'anilist-123',
      progress: { unit: 'chapter', value: '100' },
    })]

    const result = detectDuplicates(rows, existing)
    expect(result[0].duplicateOf).toBe('anilist-123')
    expect(result[0].userSkipped).toBe(true)
  })
})

describe('buildPendingReviewList', () => {
  it('includes yellow and red rows not imported', () => {
    const rows = [
      makeRow({ matchTier: 'green', matchStatus: 'matched' }),
      makeRow({ matchTier: 'yellow', csvTitle: 'Yellow Title', matchStatus: 'matched', confidenceScore: 0.6 }),
      makeRow({ matchTier: 'red', csvTitle: 'Red Title', matchStatus: 'matched', confidenceScore: 0.3, alternatives: [] }),
    ]
    const importedTiers = new Set(['green'])
    const result = buildPendingReviewList(rows, importedTiers)
    expect(result.items).toHaveLength(2)
    expect(result.items[0].csvTitle).toBe('Yellow Title')
    expect(result.items[0].tier).toBe('yellow')
    expect(result.items[1].csvTitle).toBe('Red Title')
    expect(result.items[1].tier).toBe('red')
  })

  it('returns empty list when all tiers imported', () => {
    const rows = [
      makeRow({ matchTier: 'green', matchStatus: 'matched' }),
      makeRow({ matchTier: 'yellow', matchStatus: 'matched' }),
    ]
    const importedTiers = new Set(['green', 'yellow'])
    const result = buildPendingReviewList(rows, importedTiers)
    expect(result.items).toHaveLength(0)
  })
})

describe('generateDiagnosticCsv', () => {
  it('produces re-importable CSV with diagnostic columns', () => {
    const rows = [
      makeRow({
        csvTitle: 'Solo Leveling',
        csvChapter: '100',
        csvUrl: null,
        csvTags: ['action', 'fantasy'],
        matchTier: 'yellow',
        confidenceScore: 0.62,
        bestMatch: { title: { primary: 'Na Honjaman Level-Up' } } as any,
      }),
    ]
    const csv = generateDiagnosticCsv(rows)
    expect(csv).toContain('title,ch,url,tags,status,best_match,confidence')
    expect(csv).toContain('Solo Leveling')
    expect(csv).toContain('possible_match')
    expect(csv).toContain('Na Honjaman Level-Up')
    expect(csv).toContain('0.62')
  })

  it('escapes commas and quotes in fields', () => {
    const rows = [
      makeRow({ csvTitle: 'Title, With Comma', csvTags: ['tag "quoted"'] }),
    ]
    const csv = generateDiagnosticCsv(rows)
    expect(csv).toContain('"Title, With Comma"')
  })
})

describe('collectNewTags', () => {
  it('identifies tags not in existing registry', () => {
    const rows = [
      makeRow({ csvTags: ['action', 'Romance', 'isekai'] }),
      makeRow({ csvTags: ['romance', 'comedy'] }),
    ]
    const registry: CustomTagRegistry = { 'Romance': { color: '#e94560' } }

    const newTags = collectNewTags(rows, registry)
    // 'Romance' and 'romance' both match existing — case insensitive
    expect(newTags).toContain('action')
    expect(newTags).toContain('isekai')
    expect(newTags).toContain('comedy')
    expect(newTags).not.toContain('Romance')
    expect(newTags).not.toContain('romance')
  })
})
```

- [ ] **Step 5: Run tests to verify they fail**

Run: `npm test -- src/import/confirmLogic.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 6: Implement confirm logic**

Create `src/import/confirmLogic.ts`:

```typescript
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
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

export function detectDuplicates(
  rows: ImportRow[],
  existingItems: TrackedItem[]
): ImportRow[] {
  const existingById = new Map(existingItems.map((item) => [item.providerId, item]))

  return rows.map((row) => {
    const match = row.userSelection ?? row.bestMatch
    if (!match) return row

    const existing = existingById.get(match.id)
    if (!existing) return row

    const updated = { ...row, duplicateOf: match.id }
    const importChapter = parseFloat(row.csvChapter ?? '0') || 0
    const existingChapter = parseFloat(existing.progress.value) || 0

    // Same or lower chapter — skip silently
    if (importChapter <= existingChapter) {
      return { ...updated, userSkipped: true }
    }

    // Higher chapter — check URL conditions
    if (!row.csvUrl) {
      return { ...updated, duplicateConflict: { type: 'higher_chapter_no_url' as const } }
    }

    if (existing.lastUrl && getHostname(row.csvUrl) !== getHostname(existing.lastUrl)) {
      return {
        ...updated,
        duplicateConflict: {
          type: 'different_site' as const,
          existingUrl: existing.lastUrl,
          importUrl: row.csvUrl,
        },
      }
    }

    // Higher chapter + has URL + same site (or no existing URL) = clean update
    return updated
  })
}

export function buildPendingReviewList(
  rows: ImportRow[],
  importedTiers: Set<string>
): PendingReviewList {
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

  return {
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
    items,
  }
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
    const fields = [
      csvEscape(row.csvTitle),
      row.csvChapter ?? '',
      row.csvUrl ?? '',
      csvEscape(row.csvTags.join(', ')),
      row.duplicateConflict ? 'conflict' : tierToStatus(row.matchTier),
      match ? csvEscape(match.title.primary) : '',
      row.confidenceScore !== null ? String(row.confidenceScore) : '',
    ]
    return fields.join(',')
  })

  return [header, ...lines].join('\n')
}

export function collectNewTags(rows: ImportRow[], registry: CustomTagRegistry): string[] {
  const existingLower = new Set(Object.keys(registry).map((t) => t.toLowerCase()))
  const newTags = new Map<string, string>() // lowercase -> original casing

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
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test -- src/import/confirmLogic.test.ts`
Expected: All tests PASS

- [ ] **Step 8: Run full test suite**

Run: `npm test`
Expected: All tests PASS

- [ ] **Step 9: Commit**

```bash
git add src/shared/tagColors.ts src/import/confirmLogic.ts src/import/confirmLogic.test.ts src/sidepanel/hooks/useCustomTags.ts
git commit -m "feat(import): add confirm logic, tag color extraction, and tests"
```

---

## Task 5: Background Service Worker Integration

**Files:**
- Modify: `src/background/index.ts`
- Modify: `src/background/chapterChecker.ts`

- [ ] **Step 1: Add import-active flag and rate limiter to background**

In `src/background/index.ts`, add imports at the top:

```typescript
import { RateLimiter } from './rateLimiter'
import { searchWithFallback } from './searchService'
```

Add module-level state (after existing imports):

```typescript
let importActive = false
const importRateLimiter = new RateLimiter(IMPORT_RATE_LIMIT_PER_MINUTE)
```

Add the constant import:

```typescript
import { IMPORT_RATE_LIMIT_PER_MINUTE } from '@/shared/constants'
```

- [ ] **Step 2: Add IMPORT_SEARCH case handler**

Add to the switch statement in `handleMessage()`:

```typescript
    case 'IMPORT_SEARCH': {
      const result = importRateLimiter.tryAcquire()
      if (!result.allowed) {
        return { rateLimited: true, waitMs: result.waitMs }
      }
      return await searchWithFallback(message.query, message.extractedTitle)
    }
```

- [ ] **Step 3: Add IMPORT_STATUS case handler**

Add to the switch statement:

```typescript
    case 'IMPORT_STATUS': {
      importActive = message.active
      log.info('Import status:', importActive ? 'active' : 'inactive')
      return undefined
    }
```

- [ ] **Step 4: Export importActive check from background**

Add an exported function to `src/background/index.ts`:

```typescript
export function isImportActive(): boolean {
  return importActive
}
```

- [ ] **Step 5: Update chapter checker to skip when import active**

In `src/background/chapterChecker.ts`, add import:

```typescript
import { isImportActive } from './index'
```

At the top of `handleChapterCheckAlarm()`, add a guard:

```typescript
  if (isImportActive()) {
    log.info('Skipping chapter check — CSV import is active')
    return
  }
```

Note: If circular import is an issue (index.ts imports chapterChecker.ts and vice versa), instead pass the `importActive` flag via a shared module-level variable in a small file like `src/background/state.ts`:

```typescript
// src/background/state.ts
export let importActive = false
export function setImportActive(active: boolean): void {
  importActive = active
}
```

Then both `index.ts` and `chapterChecker.ts` import from `state.ts`. Decide during implementation — if no circular dependency exists, the direct approach is simpler.

- [ ] **Step 6: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 7: Run full test suite**

Run: `npm test`
Expected: All tests PASS

- [ ] **Step 8: Commit**

```bash
git add src/background/index.ts src/background/chapterChecker.ts
# Include src/background/state.ts if the shared state approach was used
git commit -m "feat(import): add IMPORT_SEARCH and IMPORT_STATUS message handlers"
```

---

## Task 6: Build Configuration & Import Tab Shell

**Files:**
- Modify: `vite.config.ts`
- Create: `src/import/index.html`
- Create: `src/import/main.tsx`
- Create: `src/import/App.tsx`
- Create: `src/import/services/messaging.ts`
- Create: `src/import/hooks/useImportSession.ts`
- Create: `src/import/styles/import.module.css`

- [ ] **Step 1: Update Vite config — add import entry point**

In `vite.config.ts`, add the import entry to the `input` object:

```typescript
input: {
  sidepanel: resolve(__dirname, 'src/sidepanel/index.html'),
  import: resolve(__dirname, 'src/import/index.html'),
  background: resolve(__dirname, 'src/background/index.ts'),
},
```

Update the `entryFileNames` function to handle the import entry:

```typescript
entryFileNames: (chunkInfo) => {
  if (chunkInfo.name === 'background') return 'background/index.js'
  if (chunkInfo.name === 'import') return 'import/[name]-[hash].js'
  return 'sidepanel/[name]-[hash].js'
},
```

- [ ] **Step 2: Update copySidepanelHtml plugin**

The existing plugin copies `dist/src/sidepanel/index.html` and then deletes `dist/src/`. Update it to also handle the import page HTML. Rename the plugin to `copyHtmlEntries` and update the `closeBundle` hook:

1. Copy `dist/src/sidepanel/index.html` → `dist/sidepanel/index.html`
2. Copy `dist/src/import/index.html` → `dist/import/index.html`
3. Then delete `dist/src/`

Read the exact plugin code in `vite.config.ts` before editing — the specifics of the copy/cleanup logic determine the exact edit.

- [ ] **Step 3: Create import tab HTML entry**

Create `src/import/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Checkpoint — CSV Import</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 4: Create React entry point**

Create `src/import/main.tsx`:

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

- [ ] **Step 5: Create messaging service for import tab**

Create `src/import/services/messaging.ts`:

```typescript
import type { MessageRequest, MessageResponse, UnifiedSearchResult, TrackedItem, CustomTagRegistry } from '@/shared/types'
import type { ImportSearchRateLimited } from '@/shared/importTypes'

async function sendMessage<T>(message: MessageRequest): Promise<T> {
  const response = await chrome.runtime.sendMessage(message) as MessageResponse<T>
  if ('error' in response) {
    throw new Error(response.error)
  }
  return response.data
}

export async function importSearch(
  query: string,
  extractedTitle: string
): Promise<UnifiedSearchResult[] | ImportSearchRateLimited> {
  return sendMessage<UnifiedSearchResult[] | ImportSearchRateLimited>({
    type: 'IMPORT_SEARCH',
    query,
    extractedTitle,
  })
}

export async function setImportStatus(active: boolean): Promise<void> {
  return sendMessage<void>({ type: 'IMPORT_STATUS', active })
}

export async function saveItem(item: TrackedItem): Promise<void> {
  return sendMessage<void>({ type: 'SAVE_ITEM', item })
}

export async function updateItem(providerId: string, updates: Partial<TrackedItem>): Promise<void> {
  return sendMessage<void>({ type: 'UPDATE_ITEM', providerId, updates })
}

export async function getAllItems(): Promise<TrackedItem[]> {
  return sendMessage<TrackedItem[]>({ type: 'GET_ALL_ITEMS' })
}

export async function getCustomTags(): Promise<CustomTagRegistry> {
  return sendMessage<CustomTagRegistry>({ type: 'GET_CUSTOM_TAGS' })
}

export async function saveCustomTag(tagName: string, color: string): Promise<void> {
  // Uses UPDATE_CUSTOM_TAGS which also creates if not exists
  return sendMessage<void>({ type: 'UPDATE_CUSTOM_TAGS', tagName, updates: { color } })
}
```

- [ ] **Step 6: Create useImportSession hook**

Create `src/import/hooks/useImportSession.ts`:

```typescript
import { useState, useEffect, useCallback } from 'react'
import type { ImportSession } from '@/shared/importTypes'
import type { PendingReviewList } from '@/shared/importTypes'
import { IMPORT_SESSION_KEY, PENDING_REVIEW_KEY, PENDING_REVIEW_MAX_AGE_MS } from '@/shared/constants'

interface UseImportSessionReturn {
  session: ImportSession | null
  pendingReview: PendingReviewList | null
  loading: boolean
  saveSession: (session: ImportSession) => Promise<void>
  clearSession: () => Promise<void>
  savePendingReview: (list: PendingReviewList) => Promise<void>
  clearPendingReview: () => Promise<void>
}

export function useImportSession(): UseImportSessionReturn {
  const [session, setSession] = useState<ImportSession | null>(null)
  const [pendingReview, setPendingReview] = useState<PendingReviewList | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Load existing session and pending review
    chrome.storage.local.get([IMPORT_SESSION_KEY, PENDING_REVIEW_KEY], (result) => {
      const loadedSession = result[IMPORT_SESSION_KEY] as ImportSession | undefined
      const loadedPending = result[PENDING_REVIEW_KEY] as PendingReviewList | undefined

      if (loadedSession) {
        setSession(loadedSession)
      }

      if (loadedPending) {
        // Check 30-day auto-discard
        if (Date.now() - loadedPending.lastActivityAt > PENDING_REVIEW_MAX_AGE_MS) {
          chrome.storage.local.remove(PENDING_REVIEW_KEY)
        } else {
          setPendingReview(loadedPending)
        }
      }

      setLoading(false)
    })

    // Listen for external changes (e.g., side panel clearing pending review)
    const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (IMPORT_SESSION_KEY in changes) {
        setSession(changes[IMPORT_SESSION_KEY].newValue ?? null)
      }
      if (PENDING_REVIEW_KEY in changes) {
        setPendingReview(changes[PENDING_REVIEW_KEY].newValue ?? null)
      }
    }
    chrome.storage.local.onChanged.addListener(listener)
    return () => chrome.storage.local.onChanged.removeListener(listener)
  }, [])

  const saveSession = useCallback(async (s: ImportSession) => {
    const updated = { ...s, lastActivityAt: Date.now() }
    await chrome.storage.local.set({ [IMPORT_SESSION_KEY]: updated })
    setSession(updated)
  }, [])

  const clearSession = useCallback(async () => {
    await chrome.storage.local.remove(IMPORT_SESSION_KEY)
    setSession(null)
  }, [])

  const savePendingReview = useCallback(async (list: PendingReviewList) => {
    await chrome.storage.local.set({ [PENDING_REVIEW_KEY]: list })
    setPendingReview(list)
  }, [])

  const clearPendingReview = useCallback(async () => {
    await chrome.storage.local.remove(PENDING_REVIEW_KEY)
    setPendingReview(null)
  }, [])

  return { session, pendingReview, loading, saveSession, clearSession, savePendingReview, clearPendingReview }
}
```

- [ ] **Step 7: Create App shell with phase routing**

Create `src/import/App.tsx`:

```tsx
import { useImportSession } from './hooks/useImportSession'
import styles from './styles/import.module.css'

export function App() {
  const {
    session, pendingReview, loading,
    saveSession, clearSession,
    savePendingReview, clearPendingReview,
  } = useImportSession()

  if (loading) {
    return <div className={styles.container}><p>Loading...</p></div>
  }

  // Existing session — route to current phase
  if (session) {
    switch (session.phase) {
      case 'parsed':
      case 'matching':
        return <div className={styles.container}>Match phase (TODO)</div>
      case 'review':
        return <div className={styles.container}>Review phase (TODO)</div>
      case 'confirmed':
        return <div className={styles.container}>Confirmed (TODO)</div>
    }
  }

  // Pending review from a previous import — show simplified review
  if (pendingReview) {
    return (
      <div className={styles.container}>
        <p>You have {pendingReview.items.length} titles pending review from a previous import.</p>
        {/* TODO: PendingReviewTable */}
      </div>
    )
  }

  // No session — show file upload
  return <div className={styles.container}>FileUpload (TODO)</div>
}
```

- [ ] **Step 8: Create base styles**

Create `src/import/styles/import.module.css`:

```css
.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: #e0e0e0;
  background: #1a1a2e;
  min-height: 100vh;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.title {
  font-size: 20px;
  font-weight: 700;
  color: #fff;
  margin: 0;
}

.subtitle {
  color: #888;
  font-size: 13px;
  margin: 4px 0 0;
}
```

Global body styles should be added via the HTML or a global CSS import in `main.tsx`:

```css
/* Add to main.tsx as a direct import or inline in index.html */
body {
  margin: 0;
  background: #1a1a2e;
}
```

- [ ] **Step 9: Verify build works**

Run: `npm run build`
Expected: Build succeeds, `dist/import/index.html` exists alongside `dist/sidepanel/index.html`

- [ ] **Step 10: Run typecheck and tests**

Run: `npm run typecheck && npm test`
Expected: Both PASS

- [ ] **Step 11: Commit**

```bash
git add vite.config.ts src/import/index.html src/import/main.tsx src/import/App.tsx src/import/services/messaging.ts src/import/hooks/useImportSession.ts src/import/styles/import.module.css
git commit -m "feat(import): add import tab entry point, shell, session hook, and build config"
```

---

## Task 7: FileUpload Component

**Files:**
- Create: `src/import/components/FileUpload.tsx`
- Modify: `src/import/App.tsx`

- [ ] **Step 1: Create FileUpload component**

Create `src/import/components/FileUpload.tsx`:

```tsx
import { useState, useRef } from 'react'
import { parseCSV, type ParseResult, type ParsedRow, type CsvSummary } from '../csvParser'
import type { ImportSession, ImportRow } from '@/shared/importTypes'
import styles from '../styles/import.module.css'

interface FileUploadProps {
  existingSession: ImportSession | null
  onSessionCreated: (session: ImportSession) => void
  onDiscardSession: () => void
}

export function FileUpload({ existingSession, onSessionCreated, onDiscardSession }: FileUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [titleColumn, setTitleColumn] = useState<string | null>(null)

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const text = await file.text()
    const result = parseCSV(text, titleColumn ? { titleColumn } : undefined)
    setParseResult(result)
  }

  const handleColumnRemap = (column: string) => {
    setTitleColumn(column)
    // Re-trigger parse with the file input's current file
    const file = fileInputRef.current?.files?.[0]
    if (file) {
      file.text().then((text) => {
        const result = parseCSV(text, { titleColumn: column })
        setParseResult(result)
      })
    }
  }

  const handleStartMatching = () => {
    if (!parseResult || !parseResult.success) return

    const rows: ImportRow[] = parseResult.rows.map((row, i) => ({
      index: i,
      csvTitle: row.csvTitle,
      csvChapter: row.csvChapter,
      csvUrl: row.csvUrl,
      csvTags: row.csvTags,
      matchStatus: 'pending' as const,
      matchTier: null,
      bestMatch: null,
      alternatives: [],
      confidenceScore: null,
      duplicateOf: null,
      duplicateConflict: null,
      userSelection: null,
      userSkipped: false,
    }))

    const session: ImportSession = {
      id: crypto.randomUUID(),
      phase: 'matching',
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      csvSummary: parseResult.summary,
      rows,
    }

    onSessionCreated(session)
  }

  // Show resume/discard prompt if existing session
  if (existingSession) {
    return (
      <div className={styles.container}>
        <h2 className={styles.title}>Active Import Session</h2>
        <p>You have an unfinished import ({existingSession.rows.length} titles, phase: {existingSession.phase}).</p>
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button onClick={() => onSessionCreated(existingSession)}>Resume</button>
          <button onClick={onDiscardSession}>Discard and Start New</button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Import from CSV</h2>
          <p className={styles.subtitle}>Upload a CSV file with your manga tracking data</p>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        onChange={handleFileSelect}
      />

      {/* Missing title column — offer remapping */}
      {parseResult && !parseResult.success && parseResult.error === 'missing_title_column' && (
        <div>
          <p>No &apos;title&apos; column found. Available columns:</p>
          <select onChange={(e) => handleColumnRemap(e.target.value)} defaultValue="">
            <option value="" disabled>Select title column...</option>
            {parseResult.availableColumns?.map((col) => (
              <option key={col} value={col}>{col}</option>
            ))}
          </select>
        </div>
      )}

      {/* Empty file error */}
      {parseResult && !parseResult.success && parseResult.error === 'empty_file' && (
        <p>File is empty. Please select a CSV file with at least a title column.</p>
      )}

      {/* Success — show summary and preview */}
      {parseResult?.success && (
        <div>
          <h3>Summary</h3>
          <p>Found {parseResult.summary.totalRows} titles</p>
          <ul>
            <li>{parseResult.summary.withChapters} have chapter numbers</li>
            <li>{parseResult.summary.withUrls} have URLs</li>
            <li>{parseResult.summary.withTags} have tags</li>
          </ul>

          {/* Preview table — first 5 rows */}
          <h3>Preview</h3>
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Chapter</th>
                <th>URL</th>
                <th>Tags</th>
              </tr>
            </thead>
            <tbody>
              {parseResult.rows.slice(0, 5).map((row, i) => (
                <tr key={i}>
                  <td>{row.csvTitle}</td>
                  <td>{row.csvChapter ?? '—'}</td>
                  <td>{row.csvUrl ? '✓' : '—'}</td>
                  <td>{row.csvTags.join(', ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {parseResult.rows.length > 5 && (
            <p style={{ color: '#888', fontSize: 12 }}>
              ...and {parseResult.rows.length - 5} more rows
            </p>
          )}

          <button onClick={handleStartMatching} style={{ marginTop: 16 }}>
            Start Matching
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Wire FileUpload into App.tsx**

Update `src/import/App.tsx` to import and render `FileUpload` in the "no session" state, and handle session creation/discarding. Replace the `FileUpload (TODO)` placeholder and existing session prompt with the actual component:

```tsx
import { FileUpload } from './components/FileUpload'

// In the render:
// No session — show file upload
return (
  <div className={styles.container}>
    <FileUpload
      existingSession={null}
      onSessionCreated={(s) => saveSession(s)}
      onDiscardSession={() => clearSession()}
    />
  </div>
)
```

Also wire the existing session case (when user opens tab and a session exists) to pass it to FileUpload for the resume/discard prompt. This requires restructuring the phase routing to check the session phase — if `session` exists and phase is not yet `matching`, show FileUpload with `existingSession={session}`.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/import/components/FileUpload.tsx src/import/App.tsx
git commit -m "feat(import): add FileUpload component with CSV parsing and preview"
```

---

## Task 8: Batch Matcher Hook & MatchProgress Component

**Files:**
- Create: `src/import/hooks/useBatchMatcher.ts`
- Create: `src/import/components/MatchProgress.tsx`
- Modify: `src/import/App.tsx`

- [ ] **Step 1: Create useBatchMatcher hook**

Create `src/import/hooks/useBatchMatcher.ts`:

```typescript
import { useState, useRef, useCallback, useEffect } from 'react'
import type { ImportSession, ImportRow, MatchTier } from '@/shared/importTypes'
import { IMPORT_BATCH_CHECKPOINT_SIZE } from '@/shared/constants'
import { importSearch, setImportStatus, getAllItems } from '../services/messaging'
import { classifyMatchTier, detectDuplicates } from '../confirmLogic'
import { cleanSearchQuery } from '@/shared/utils'
import type { UnifiedSearchResult } from '@/shared/types'

interface BatchMatcherState {
  isRunning: boolean
  isPaused: boolean
  currentTitle: string | null
  progress: { done: number; total: number }
  tally: { green: number; yellow: number; red: number; failed: number }
  startedAt: number | null
}

interface UseBatchMatcherReturn extends BatchMatcherState {
  start: (session: ImportSession) => void
  pause: () => void
  resume: () => void
  cancel: () => void
  retryFailed: () => void
}

export function useBatchMatcher(
  onCheckpoint: (session: ImportSession) => Promise<void>,
  onComplete: (session: ImportSession) => Promise<void>
): UseBatchMatcherReturn {
  const [state, setState] = useState<BatchMatcherState>({
    isRunning: false,
    isPaused: false,
    currentTitle: null,
    progress: { done: 0, total: 0 },
    tally: { green: 0, yellow: 0, red: 0, failed: 0 },
    startedAt: null,
  })

  const sessionRef = useRef<ImportSession | null>(null)
  const pausedRef = useRef(false)
  const cancelledRef = useRef(false)

  const countTally = useCallback((rows: ImportRow[]) => {
    const tally = { green: 0, yellow: 0, red: 0, failed: 0 }
    for (const row of rows) {
      if (row.matchStatus === 'failed') tally.failed++
      else if (row.matchTier === 'green') tally.green++
      else if (row.matchTier === 'yellow') tally.yellow++
      else if (row.matchTier === 'red') tally.red++
    }
    return tally
  }, [])

  const runLoop = useCallback(async (session: ImportSession) => {
    sessionRef.current = session
    cancelledRef.current = false
    pausedRef.current = false

    await setImportStatus(true)

    setState((s) => ({
      ...s,
      isRunning: true,
      isPaused: false,
      startedAt: Date.now(),
      progress: { done: 0, total: session.rows.length },
    }))

    const rows = [...session.rows]
    let checkpointCounter = 0

    for (let i = 0; i < rows.length; i++) {
      if (cancelledRef.current) break
      if (pausedRef.current) {
        // Save checkpoint and stop
        const updated = { ...session, rows, phase: 'matching' as const }
        await onCheckpoint(updated)
        sessionRef.current = updated
        await setImportStatus(false)
        return
      }

      const row = rows[i]
      if (row.matchStatus !== 'pending') {
        // Already matched or failed — count toward progress
        const done = rows.filter((r) => r.matchStatus !== 'pending').length
        setState((s) => ({
          ...s,
          progress: { done, total: rows.length },
          tally: countTally(rows),
        }))
        continue
      }

      setState((s) => ({ ...s, currentTitle: row.csvTitle }))

      try {
        const cleanedTitle = cleanSearchQuery(row.csvTitle) || row.csvTitle
        let results: UnifiedSearchResult[] | null = null

        // Search with rate limit retry
        while (true) {
          const response = await importSearch(cleanedTitle, row.csvTitle)
          if (Array.isArray(response)) {
            results = response
            break
          }
          // Rate limited — wait and retry
          if ('rateLimited' in response && response.rateLimited) {
            await new Promise((resolve) => setTimeout(resolve, response.waitMs))
          }
        }

        if (results && results.length > 0) {
          const best = results[0]
          const tier = classifyMatchTier(best.confidence)
          rows[i] = {
            ...row,
            matchStatus: 'matched',
            matchTier: tier,
            bestMatch: best,
            alternatives: results.slice(1, 6),
            confidenceScore: best.confidence,
          }
        } else {
          rows[i] = {
            ...row,
            matchStatus: 'matched',
            matchTier: 'red',
            bestMatch: null,
            alternatives: [],
            confidenceScore: null,
          }
        }
      } catch {
        rows[i] = { ...row, matchStatus: 'failed' }
      }

      checkpointCounter++
      const done = rows.filter((r) => r.matchStatus !== 'pending').length
      setState((s) => ({
        ...s,
        progress: { done, total: rows.length },
        tally: countTally(rows),
      }))

      // Save checkpoint every N rows
      if (checkpointCounter >= IMPORT_BATCH_CHECKPOINT_SIZE) {
        const updated = { ...session, rows, phase: 'matching' as const }
        await onCheckpoint(updated)
        sessionRef.current = updated
        checkpointCounter = 0
      }
    }

    // Matching complete — run duplicate detection
    const existingItems = await getAllItems()
    const rowsWithDuplicates = detectDuplicates(rows, existingItems)

    const completed: ImportSession = {
      ...session,
      rows: rowsWithDuplicates,
      phase: 'review',
    }

    await setImportStatus(false)
    sessionRef.current = completed

    setState((s) => ({
      ...s,
      isRunning: false,
      currentTitle: null,
      tally: countTally(rowsWithDuplicates),
    }))

    await onComplete(completed)
  }, [onCheckpoint, onComplete, countTally])

  const start = useCallback((session: ImportSession) => {
    runLoop(session)
  }, [runLoop])

  const pause = useCallback(() => {
    pausedRef.current = true
    setState((s) => ({ ...s, isPaused: true }))
  }, [])

  const resume = useCallback(() => {
    if (sessionRef.current) {
      runLoop(sessionRef.current)
    }
  }, [runLoop])

  const cancel = useCallback(async () => {
    cancelledRef.current = true
    await setImportStatus(false)
    setState((s) => ({ ...s, isRunning: false, isPaused: false }))
  }, [])

  const retryFailed = useCallback(() => {
    if (!sessionRef.current) return
    const session = sessionRef.current
    const rows = session.rows.map((row) =>
      row.matchStatus === 'failed' ? { ...row, matchStatus: 'pending' as const } : row
    )
    runLoop({ ...session, rows, phase: 'matching' })
  }, [runLoop])

  // Cleanup: mark import inactive on unmount
  useEffect(() => {
    return () => {
      if (sessionRef.current) {
        setImportStatus(false)
      }
    }
  }, [])

  return { ...state, start, pause, resume, cancel, retryFailed }
}
```

- [ ] **Step 2: Create MatchProgress component**

Create `src/import/components/MatchProgress.tsx`:

```tsx
import styles from '../styles/import.module.css'

interface MatchProgressProps {
  currentTitle: string | null
  progress: { done: number; total: number }
  tally: { green: number; yellow: number; red: number; failed: number }
  isPaused: boolean
  startedAt: number | null
  onPause: () => void
  onResume: () => void
  onCancel: () => void
  failedCount: number
  onRetryFailed?: () => void
}

export function MatchProgress({
  currentTitle,
  progress,
  tally,
  isPaused,
  startedAt,
  onPause,
  onResume,
  onCancel,
  failedCount,
  onRetryFailed,
}: MatchProgressProps) {
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0

  // Estimate time remaining
  let etaText = ''
  if (startedAt && progress.done > 0 && !isPaused) {
    const elapsed = Date.now() - startedAt
    const rate = progress.done / elapsed
    const remaining = (progress.total - progress.done) / rate
    const mins = Math.ceil(remaining / 60_000)
    etaText = mins <= 1 ? '< 1 min remaining' : `~${mins} min remaining`
  }

  return (
    <div>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>
            {isPaused ? 'Import Paused' : 'Matching Titles'}
          </h2>
          <p className={styles.subtitle}>Searching AniList & MangaDex</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {isPaused ? (
            <button onClick={onResume}>Resume</button>
          ) : (
            <button onClick={onPause}>Pause</button>
          )}
          <button onClick={onCancel}>Cancel</button>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{
        background: '#2a2a4a', borderRadius: 8, height: 28,
        overflow: 'hidden', position: 'relative', marginBottom: 8
      }}>
        <div style={{
          background: 'linear-gradient(90deg, #4a9eff, #6ab0ff)',
          width: `${pct}%`, height: '100%', borderRadius: 8, transition: 'width 0.3s',
        }} />
        <span style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          fontSize: 13, fontWeight: 600, color: '#fff',
        }}>
          {progress.done} / {progress.total}
        </span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24, fontSize: 13, color: '#888' }}>
        <span>{pct}% complete</span>
        <span>{etaText}</span>
      </div>

      {/* Current title */}
      {currentTitle && !isPaused && (
        <div style={{
          background: '#2a2a4a', borderRadius: 8, padding: 16,
          marginBottom: 16, borderLeft: '3px solid #4a9eff',
        }}>
          <div style={{ fontSize: 12, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Now searching
          </div>
          <div style={{ fontSize: 15, color: '#fff' }}>{currentTitle}</div>
        </div>
      )}

      {/* Paused message */}
      {isPaused && (
        <div style={{
          background: '#2a2a4a', borderRadius: 8, padding: 16, marginBottom: 16,
          borderLeft: '3px solid #facc15',
        }}>
          <div style={{ color: '#facc15' }}>
            Import paused — {progress.done}/{progress.total} searched
          </div>
        </div>
      )}

      {/* Running tally */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <TallyCard label="Matched" count={tally.green} color="#4ade80" bg="#1a2a1a" border="#2a4a2a" />
        <TallyCard label="Possible" count={tally.yellow} color="#facc15" bg="#2a2a1a" border="#4a4a2a" />
        <TallyCard label="No Match" count={tally.red} color="#f87171" bg="#2a1a1a" border="#4a2a2a" />
        <TallyCard label="Failed" count={tally.failed} color="#888" bg="#2a2a2a" border="#444" />
      </div>

      {/* Retry failed button (only if matching is complete and there are failures) */}
      {failedCount > 0 && isPaused && onRetryFailed && (
        <button onClick={onRetryFailed}>Retry Failed ({failedCount})</button>
      )}
    </div>
  )
}

function TallyCard({ label, count, color, bg, border }: {
  label: string; count: number; color: string; bg: string; border: string
}) {
  return (
    <div style={{
      flex: 1, background: bg, border: `1px solid ${border}`,
      borderRadius: 8, padding: 12, textAlign: 'center',
    }}>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{count}</div>
      <div style={{ fontSize: 11, color, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Wire matching phase into App.tsx**

Update `src/import/App.tsx` to:
1. Import `useBatchMatcher` and `MatchProgress`
2. In the `matching` phase case, render `MatchProgress` connected to the hook
3. Auto-start matching when session transitions to `matching` phase from FileUpload
4. On checkpoint, call `saveSession`
5. On complete, call `saveSession` with the review-phase session

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/import/hooks/useBatchMatcher.ts src/import/components/MatchProgress.tsx src/import/App.tsx
git commit -m "feat(import): add batch matcher hook and progress UI"
```

---

## Task 9: ReviewTable & SimilarModal Components

**Files:**
- Create: `src/import/components/ReviewTable.tsx`
- Create: `src/import/components/SimilarModal.tsx`
- Modify: `src/import/App.tsx`

- [ ] **Step 1: Create SimilarModal component**

Create `src/import/components/SimilarModal.tsx`:

```tsx
import { useState } from 'react'
import type { ImportRow } from '@/shared/importTypes'
import type { UnifiedSearchResult } from '@/shared/types'
import { importSearch } from '../services/messaging'
import { cleanSearchQuery } from '@/shared/utils'

interface SimilarModalProps {
  row: ImportRow
  onSelect: (result: UnifiedSearchResult) => void
  onSkip: () => void
  onClose: () => void
}

export function SimilarModal({ row, onSelect, onSkip, onClose }: SimilarModalProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<UnifiedSearchResult[]>([])
  const [searching, setSearching] = useState(false)

  const currentMatch = row.userSelection ?? row.bestMatch
  const allResults = searchResults.length > 0
    ? searchResults
    : [currentMatch, ...row.alternatives].filter(Boolean) as UnifiedSearchResult[]

  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    setSearching(true)
    try {
      const cleaned = cleanSearchQuery(searchQuery) || searchQuery
      const response = await importSearch(cleaned, searchQuery)
      if (Array.isArray(response)) {
        setSearchResults(response)
      }
    } finally {
      setSearching(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch()
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }} onClick={onClose}>
      <div style={{
        background: '#1e1e36', borderRadius: 12, padding: 24,
        maxWidth: 600, width: '90%', maxHeight: '80vh', overflow: 'auto',
      }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 4px', color: '#fff' }}>Find Match</h3>
        <p style={{ margin: '0 0 16px', color: '#888', fontSize: 13 }}>
          CSV title: <strong style={{ color: '#e0e0e0' }}>{row.csvTitle}</strong>
        </p>

        {/* Search bar */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Try a different name..."
            autoFocus={row.matchTier === 'red'}
            style={{
              flex: 1, background: '#2a2a4a', border: '1px solid #444',
              color: '#e0e0e0', padding: '8px 12px', borderRadius: 6, fontSize: 13,
            }}
          />
          <button onClick={handleSearch} disabled={searching}>
            {searching ? '...' : 'Search'}
          </button>
        </div>

        {/* Results list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {allResults.map((result) => (
            <div
              key={`${result.provider}-${result.id}`}
              onClick={() => onSelect(result)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: 12,
                background: '#2a2a4a', borderRadius: 8, cursor: 'pointer',
              }}
            >
              {result.coverUrl && (
                <img src={result.coverUrl} alt="" style={{ width: 40, height: 56, borderRadius: 4, objectFit: 'cover' }} />
              )}
              <div style={{ flex: 1 }}>
                <div style={{ color: '#fff', fontSize: 14 }}>{result.title.primary}</div>
                <div style={{ color: '#888', fontSize: 12 }}>
                  {result.format} · {result.chapters ?? '?'} chapters · {result.provider}
                </div>
              </div>
              <div style={{ color: '#4a9eff', fontSize: 13, fontWeight: 600 }}>
                {(result.confidence * 100).toFixed(0)}%
              </div>
            </div>
          ))}

          {allResults.length === 0 && (
            <p style={{ color: '#888', textAlign: 'center', padding: 24 }}>
              No results. Try a different search term.
            </p>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button onClick={onSkip}>Skip</button>
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create ReviewTable component**

Create `src/import/components/ReviewTable.tsx`:

```tsx
import { useState, useMemo } from 'react'
import type { ImportSession, ImportRow, MatchTier } from '@/shared/importTypes'
import type { UnifiedSearchResult } from '@/shared/types'
import { SimilarModal } from './SimilarModal'

interface ReviewTableProps {
  session: ImportSession
  onRowUpdate: (index: number, updates: Partial<ImportRow>) => void
  onContinue: () => void
  onRetryFailed: (() => void) | null
}

type FilterTier = 'green' | 'yellow' | 'red' | 'duplicate'

export function ReviewTable({ session, onRowUpdate, onContinue, onRetryFailed }: ReviewTableProps) {
  const [activeFilters, setActiveFilters] = useState<Set<FilterTier>>(new Set(['green', 'yellow', 'red', 'duplicate']))
  const [searchQuery, setSearchQuery] = useState('')
  const [modalRow, setModalRow] = useState<ImportRow | null>(null)
  const [sortField, setSortField] = useState<'csvTitle' | 'confidenceScore'>('csvTitle')
  const [sortAsc, setSortAsc] = useState(true)

  // Compute counts
  const counts = useMemo(() => {
    const c = { green: 0, yellow: 0, red: 0, duplicate: 0 }
    for (const row of session.rows) {
      if (row.duplicateOf) c.duplicate++
      if (row.matchTier === 'green') c.green++
      else if (row.matchTier === 'yellow') c.yellow++
      else if (row.matchTier === 'red') c.red++
    }
    return c
  }, [session.rows])

  const failedCount = session.rows.filter((r) => r.matchStatus === 'failed').length

  // Filter and sort rows
  const filteredRows = useMemo(() => {
    let rows = session.rows.filter((row) => {
      if (row.userSkipped) return false
      const isDuplicate = !!row.duplicateOf
      const tier = row.matchTier

      if (isDuplicate && !activeFilters.has('duplicate')) return false
      if (tier && !isDuplicate && !activeFilters.has(tier)) return false

      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        const match = row.userSelection ?? row.bestMatch
        if (!row.csvTitle.toLowerCase().includes(q) &&
            !(match?.title.primary.toLowerCase().includes(q))) {
          return false
        }
      }
      return true
    })

    rows.sort((a, b) => {
      let cmp = 0
      if (sortField === 'csvTitle') {
        cmp = a.csvTitle.localeCompare(b.csvTitle)
      } else {
        cmp = (a.confidenceScore ?? 0) - (b.confidenceScore ?? 0)
      }
      return sortAsc ? cmp : -cmp
    })

    return rows
  }, [session.rows, activeFilters, searchQuery, sortField, sortAsc])

  const toggleFilter = (tier: FilterTier) => {
    setActiveFilters((prev) => {
      const next = new Set(prev)
      if (next.has(tier)) next.delete(tier)
      else next.add(tier)
      return next
    })
  }

  const toggleSort = (field: 'csvTitle' | 'confidenceScore') => {
    if (sortField === field) setSortAsc(!sortAsc)
    else { setSortField(field); setSortAsc(true) }
  }

  const handleSelect = (result: UnifiedSearchResult) => {
    if (!modalRow) return
    onRowUpdate(modalRow.index, {
      userSelection: result,
      matchTier: 'green', // User explicitly chose — treat as confirmed
      confidenceScore: result.confidence,
    })
    setModalRow(null)
  }

  const handleSkip = () => {
    if (!modalRow) return
    onRowUpdate(modalRow.index, { userSkipped: true })
    setModalRow(null)
  }

  const getStatusColor = (row: ImportRow) => {
    if (row.duplicateOf) return '#60a5fa'
    switch (row.matchTier) {
      case 'green': return '#4ade80'
      case 'yellow': return '#facc15'
      case 'red': return '#f87171'
      default: return '#888'
    }
  }

  const getActionLabel = (row: ImportRow) => {
    if (row.duplicateOf) return 'Resolve'
    switch (row.matchTier) {
      case 'green': return 'Similar'
      case 'yellow': return 'Review'
      case 'red': return 'Search'
      default: return 'View'
    }
  }

  return (
    <div>
      {/* Summary banner */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #333' }}>
        <SummaryTile label="Matched" count={counts.green} color="#4ade80" />
        <SummaryTile label="Possible" count={counts.yellow} color="#facc15" />
        <SummaryTile label="No Match" count={counts.red} color="#f87171" />
        <SummaryTile label="Duplicates" count={counts.duplicate} color="#60a5fa" />
      </div>

      {/* Filter bar */}
      <div style={{ padding: '12px 20px', display: 'flex', gap: 8, alignItems: 'center', borderBottom: '1px solid #2a2a4a' }}>
        <span style={{ fontSize: 12, color: '#888' }}>Show:</span>
        <FilterPill label="Matched" active={activeFilters.has('green')} color="#4ade80" onClick={() => toggleFilter('green')} />
        <FilterPill label="Possible" active={activeFilters.has('yellow')} color="#facc15" onClick={() => toggleFilter('yellow')} />
        <FilterPill label="No Match" active={activeFilters.has('red')} color="#f87171" onClick={() => toggleFilter('red')} />
        <FilterPill label="Duplicates" active={activeFilters.has('duplicate')} color="#60a5fa" onClick={() => toggleFilter('duplicate')} />
        <div style={{ flex: 1 }} />
        <input
          type="text"
          placeholder="Search titles..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ background: '#2a2a4a', border: '1px solid #444', color: '#e0e0e0', padding: '6px 12px', borderRadius: 6, fontSize: 12, width: 200 }}
        />
      </div>

      {/* Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #333', textTransform: 'uppercase', fontSize: 11, letterSpacing: 0.5, color: '#888' }}>
            <th style={{ padding: '10px 20px', width: 40 }} />
            <th style={{ padding: '10px 8px', textAlign: 'left', cursor: 'pointer' }} onClick={() => toggleSort('csvTitle')}>
              CSV Title {sortField === 'csvTitle' ? (sortAsc ? '↑' : '↓') : ''}
            </th>
            <th style={{ padding: '10px 8px', textAlign: 'left' }}>Matched To</th>
            <th style={{ padding: '10px 8px', textAlign: 'center', width: 70, cursor: 'pointer' }} onClick={() => toggleSort('confidenceScore')}>
              Score {sortField === 'confidenceScore' ? (sortAsc ? '↑' : '↓') : ''}
            </th>
            <th style={{ padding: '10px 8px', textAlign: 'center', width: 50 }}>Ch</th>
            <th style={{ padding: '10px 8px', textAlign: 'center', width: 80 }}>Format</th>
            <th style={{ padding: '10px 20px', textAlign: 'center', width: 100 }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {filteredRows.map((row) => {
            const match = row.userSelection ?? row.bestMatch
            return (
              <tr key={row.index} style={{ borderBottom: '1px solid #2a2a3a' }}>
                <td style={{ padding: '10px 20px' }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: getStatusColor(row) }} />
                </td>
                <td style={{ padding: '10px 8px', color: '#e0e0e0' }}>{row.csvTitle}</td>
                <td style={{ padding: '10px 8px' }}>
                  {match ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {match.coverUrl && (
                        <img src={match.coverUrl} alt="" style={{ width: 28, height: 38, borderRadius: 3, objectFit: 'cover' }} />
                      )}
                      <div>
                        <span style={{ color: getStatusColor(row) }}>{match.title.primary}</span>
                        {row.duplicateConflict && (
                          <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                            {row.duplicateConflict.type === 'higher_chapter_no_url'
                              ? `Already tracked — import has higher ch but no URL`
                              : `Different reading site`}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <span style={{ color: '#666', fontStyle: 'italic' }}>No match found</span>
                  )}
                </td>
                <td style={{ padding: '10px 8px', textAlign: 'center', color: getStatusColor(row), fontWeight: 600 }}>
                  {row.confidenceScore !== null ? row.confidenceScore.toFixed(2) : '—'}
                </td>
                <td style={{ padding: '10px 8px', textAlign: 'center', color: '#888' }}>
                  {row.csvChapter ?? '—'}
                </td>
                <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                  <span style={{ background: '#2a2a4a', padding: '2px 8px', borderRadius: 4, fontSize: 11, color: '#aaa' }}>
                    {match?.format ?? '—'}
                  </span>
                </td>
                <td style={{ padding: '10px 20px', textAlign: 'center' }}>
                  <button onClick={() => setModalRow(row)} style={{ fontSize: 11 }}>
                    {getActionLabel(row)}
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* Bottom action bar */}
      <div style={{ padding: '16px 20px', borderTop: '1px solid #333', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        {failedCount > 0 && onRetryFailed && (
          <button onClick={onRetryFailed}>Retry Failed ({failedCount})</button>
        )}
        <button onClick={onContinue}>Continue to Import →</button>
      </div>

      {/* Modal */}
      {modalRow && (
        <SimilarModal
          row={modalRow}
          onSelect={handleSelect}
          onSkip={handleSkip}
          onClose={() => setModalRow(null)}
        />
      )}
    </div>
  )
}

function SummaryTile({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div style={{
      flex: 1, padding: '16px 20px', textAlign: 'center',
      background: `${color}11`, borderBottom: `2px solid ${color}`,
    }}>
      <div style={{ fontSize: 24, fontWeight: 700, color }}>{count}</div>
      <div style={{ fontSize: 11, color, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
    </div>
  )
}

function FilterPill({ label, active, color, onClick }: {
  label: string; active: boolean; color: string; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? `${color}22` : '#2a2a4a',
        color: active ? color : '#888',
        border: `1px solid ${active ? color + '44' : '#444'}`,
        padding: '4px 12px', borderRadius: 14, fontSize: 12, cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )
}
```

- [ ] **Step 3: Wire review phase into App.tsx**

Update `App.tsx` to:
1. Import `ReviewTable`
2. In the `review` phase, render `ReviewTable` with the session
3. Handle `onRowUpdate` by updating the session row and saving
4. Handle `onContinue` by transitioning to confirm phase

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/import/components/ReviewTable.tsx src/import/components/SimilarModal.tsx src/import/App.tsx
git commit -m "feat(import): add review table and similar modal components"
```

---

## Task 10: ConfirmPanel & Completion

**Files:**
- Create: `src/import/components/ConfirmPanel.tsx`
- Modify: `src/import/App.tsx`

- [ ] **Step 1: Create ConfirmPanel component**

Create `src/import/components/ConfirmPanel.tsx`:

```tsx
import { useState, useMemo, useEffect } from 'react'
import type { ImportSession, ImportRow, MatchTier } from '@/shared/importTypes'
import type { TrackedItem, CustomTagRegistry } from '@/shared/types'
import {
  buildPendingReviewList,
  generateDiagnosticCsv,
  collectNewTags,
} from '../confirmLogic'
import { getNextTagColor } from '@/shared/tagColors'
import { saveItem, updateItem, getCustomTags, saveCustomTag } from '../services/messaging'

interface ConfirmPanelProps {
  session: ImportSession
  onComplete: (result: ImportResult) => void
  onSavePendingReview: (list: any) => Promise<void>
  onClearSession: () => Promise<void>
}

interface ImportResult {
  added: number
  updated: number
  skipped: number
}

export function ConfirmPanel({ session, onComplete, onSavePendingReview, onClearSession }: ConfirmPanelProps) {
  const [selectedTiers, setSelectedTiers] = useState<Set<MatchTier>>(new Set(['green']))
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  // Compute tier counts
  const tierCounts = useMemo(() => {
    const counts = { green: 0, yellow: 0, red: 0 }
    for (const row of session.rows) {
      if (row.userSkipped || !row.matchTier) continue
      const match = row.userSelection ?? row.bestMatch
      if (!match) continue
      counts[row.matchTier]++
    }
    return counts
  }, [session.rows])

  // Compute duplicate stats
  const dupStats = useMemo(() => {
    const stats = { updates: 0, skipped: 0, conflicts: 0 }
    for (const row of session.rows) {
      if (!row.duplicateOf) continue
      if (row.userSkipped) { stats.skipped++; continue }
      if (row.duplicateConflict) { stats.conflicts++; continue }
      stats.updates++
    }
    return stats
  }, [session.rows])

  // New tags — load actual registry to get accurate count
  const [tagRegistry, setTagRegistry] = useState<CustomTagRegistry>({})
  useEffect(() => {
    getCustomTags().then(setTagRegistry)
  }, [])

  const newTagsList = useMemo(() => {
    return collectNewTags(session.rows, tagRegistry)
  }, [session.rows, tagRegistry])

  const toggleTier = (tier: MatchTier) => {
    setSelectedTiers((prev) => {
      const next = new Set(prev)
      if (next.has(tier)) next.delete(tier)
      else next.add(tier)
      return next
    })
  }

  const handleImport = async () => {
    setImporting(true)

    // Collect importable rows from selected tiers
    const importableRows = session.rows.filter((row) => {
      if (row.userSkipped) return false
      if (!row.matchTier || !selectedTiers.has(row.matchTier)) return false
      const match = row.userSelection ?? row.bestMatch
      return match !== null
    })

    // Include clean duplicate updates (no conflict, higher chapter + URL)
    const duplicateUpdates = session.rows.filter((row) =>
      row.duplicateOf && !row.duplicateConflict && !row.userSkipped
    )

    setProgress({ done: 0, total: importableRows.length + duplicateUpdates.length })

    // Create new tags first
    const registry = await getCustomTags()
    const newTags = collectNewTags(session.rows, registry)
    let currentRegistry = { ...registry }
    for (const tagName of newTags) {
      const color = getNextTagColor(currentRegistry)
      await saveCustomTag(tagName, color)
      currentRegistry[tagName] = { color }
    }

    // Normalize CSV tags to existing registry casing
    const registryLower = new Map(
      Object.keys(currentRegistry).map((k) => [k.toLowerCase(), k])
    )

    let added = 0
    let updated = 0
    let skipped = 0
    let done = 0

    // Import new items
    for (const row of importableRows) {
      const match = (row.userSelection ?? row.bestMatch)!

      // Skip if it's a duplicate (handled separately)
      if (row.duplicateOf) {
        done++
        setProgress({ done, total: importableRows.length + duplicateUpdates.length })
        continue
      }

      // Normalize tags to registry casing
      const normalizedTags = row.csvTags
        .map((t) => registryLower.get(t.toLowerCase()) ?? t)

      const item: TrackedItem = {
        provider: match.provider,
        providerId: match.id,
        mediaType: 'manga',
        format: match.format,
        titles: { main: match.title.primary, alt: match.title.alt },
        coverImage: match.coverUrl,
        progress: { unit: 'chapter', value: row.csvChapter ?? '0' },
        lastUrl: row.csvUrl ?? '',
        updatedAt: Date.now(),
        createdAt: Date.now(),
        chaptersWhenAdded: match.chapters,
        latestKnownChapters: match.chapters,
        lastApiCheck: null,
        notificationsEnabled: true,
        anilistStatus: match.status,
        genres: match.genres,
        tags: normalizedTags,
        genresBackfilled: match.genres.length > 0,
      }

      try {
        await saveItem(item)
        added++
      } catch {
        skipped++
      }

      done++
      setProgress({ done, total: importableRows.length + duplicateUpdates.length })
    }

    // Process duplicate updates
    for (const row of duplicateUpdates) {
      try {
        const updates: Partial<TrackedItem> = {}
        if (row.csvChapter) updates.progress = { unit: 'chapter', value: row.csvChapter }
        if (row.csvUrl) updates.lastUrl = row.csvUrl
        await updateItem(row.duplicateOf!, updates)
        updated++
      } catch {
        skipped++
      }

      done++
      setProgress({ done, total: importableRows.length + duplicateUpdates.length })
    }

    // Build pending review list from unselected tiers + unresolved conflicts
    const pendingList = buildPendingReviewList(session.rows, selectedTiers)

    // Add unresolved conflicts to pending
    const conflictItems = session.rows
      .filter((r) => r.duplicateConflict && !r.userSkipped)
      .map((r) => ({
        csvTitle: r.csvTitle,
        csvChapter: r.csvChapter,
        csvUrl: r.csvUrl,
        csvTags: r.csvTags,
        tier: (r.matchTier ?? 'yellow') as 'yellow' | 'red',
        bestMatch: r.userSelection ?? r.bestMatch,
        alternatives: r.alternatives,
        confidenceScore: r.confidenceScore,
      }))

    if (conflictItems.length > 0) {
      pendingList.items.push(...conflictItems)
    }

    if (pendingList.items.length > 0) {
      await onSavePendingReview(pendingList)
    }

    await onClearSession()
    onComplete({ added, updated, skipped })
  }

  const handleExportRemaining = () => {
    const remaining = session.rows.filter((row) => {
      if (row.userSkipped) return false
      if (!row.matchTier || selectedTiers.has(row.matchTier)) return false
      return true
    })

    // Include unresolved conflicts
    const conflicts = session.rows.filter((r) => r.duplicateConflict && !r.userSkipped)
    const allRemaining = [...remaining, ...conflicts]

    const csv = generateDiagnosticCsv(allRemaining)
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `checkpoint-import-remaining-${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // Completion screen
  if (!importing && progress) {
    // Already completed — show result
    return null // Handled by parent via onComplete callback
  }

  return (
    <div>
      <h2 style={{ color: '#fff', margin: '0 0 24px' }}>Ready to Import</h2>

      {/* Tier checkboxes */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
        <TierCheckbox
          label={`Matched titles (${tierCounts.green})`}
          checked={selectedTiers.has('green')}
          onChange={() => toggleTier('green')}
          color="#4ade80"
        />
        <TierCheckbox
          label={`Possible matches (${tierCounts.yellow})`}
          checked={selectedTiers.has('yellow')}
          onChange={() => toggleTier('yellow')}
          color="#facc15"
        />
        <TierCheckbox
          label={`No match / unresolved (${tierCounts.red})`}
          checked={selectedTiers.has('red')}
          onChange={() => toggleTier('red')}
          color="#f87171"
        />
      </div>

      {/* Duplicate summary */}
      {(dupStats.updates > 0 || dupStats.skipped > 0 || dupStats.conflicts > 0) && (
        <div style={{ borderTop: '1px solid #333', paddingTop: 16, marginBottom: 16, fontSize: 13, color: '#888' }}>
          <p style={{ margin: '0 0 8px' }}>{dupStats.updates + dupStats.skipped + dupStats.conflicts} duplicates will be handled:</p>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {dupStats.updates > 0 && <li>{dupStats.updates} updates (higher ch + URL)</li>}
            {dupStats.skipped > 0 && <li>{dupStats.skipped} skipped (same or lower ch)</li>}
            {dupStats.conflicts > 0 && <li>{dupStats.conflicts} conflicts → staged for review</li>}
          </ul>
        </div>
      )}

      {/* New tags */}
      {newTagsList.length > 0 && (
        <p style={{ fontSize: 13, color: '#888', marginBottom: 24 }}>
          {newTagsList.length} new tags will be created
        </p>
      )}

      {/* Import progress */}
      {importing && progress && (
        <div style={{ marginBottom: 16 }}>
          <p style={{ color: '#4a9eff' }}>Importing... {progress.done}/{progress.total}</p>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid #333', paddingTop: 16 }}>
        <button onClick={handleImport} disabled={importing}>
          Import Selected
        </button>
        <button onClick={handleExportRemaining} disabled={importing}>
          Export Remaining as CSV
        </button>
      </div>
    </div>
  )
}

function TierCheckbox({ label, checked, onChange, color }: {
  label: string; checked: boolean; onChange: () => void; color: string
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: '#e0e0e0' }}>
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span style={{ color }}>{label}</span>
    </label>
  )
}
```

- [ ] **Step 2: Create completion screen in App.tsx**

Update `App.tsx` to handle the `confirmed` phase with a completion screen showing the import result:

```tsx
// Add state for import result
const [importResult, setImportResult] = useState<{ added: number; updated: number; skipped: number } | null>(null)

// Completion screen
if (importResult) {
  return (
    <div className={styles.container}>
      <h2 style={{ color: '#fff' }}>Import Complete</h2>
      <p>{importResult.added} titles added to your library</p>
      {importResult.updated > 0 && <p>{importResult.updated} existing titles updated</p>}
      {importResult.skipped > 0 && <p>{importResult.skipped} skipped</p>}
      {pendingReview && pendingReview.items.length > 0 && (
        <p>{pendingReview.items.length} titles staged for later review</p>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button onClick={() => setImportResult(null)}>Import Another CSV</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Wire confirm phase into App.tsx**

Connect `ConfirmPanel` to the `confirmed` phase in the App router. Pass `onComplete`, `onSavePendingReview`, and `onClearSession` props.

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/import/components/ConfirmPanel.tsx src/import/App.tsx
git commit -m "feat(import): add confirm panel with tier selection and import execution"
```

---

## Task 11: Side Panel Integration

**Files:**
- Create: `src/sidepanel/hooks/usePendingReview.ts`
- Create: `src/sidepanel/components/ImportBanner.tsx`
- Modify: `src/sidepanel/App.tsx`
- Modify: `src/sidepanel/components/SettingsPage.tsx`

- [ ] **Step 1: Create usePendingReview hook**

Create `src/sidepanel/hooks/usePendingReview.ts`:

```typescript
import { useState, useEffect, useCallback } from 'react'
import {
  IMPORT_SESSION_KEY,
  PENDING_REVIEW_KEY,
  PENDING_REVIEW_MAX_AGE_MS,
} from '@/shared/constants'
import type { ImportSession, PendingReviewList } from '@/shared/importTypes'

interface UsePendingReviewReturn {
  pendingCount: number
  importInProgress: { done: number; total: number } | null
  openImportTab: () => void
  dismissPending: () => void
}

export function usePendingReview(): UsePendingReviewReturn {
  const [pendingCount, setPendingCount] = useState(0)
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null)

  useEffect(() => {
    // Load initial state
    chrome.storage.local.get([IMPORT_SESSION_KEY, PENDING_REVIEW_KEY], (result) => {
      const session = result[IMPORT_SESSION_KEY] as ImportSession | undefined
      const pending = result[PENDING_REVIEW_KEY] as PendingReviewList | undefined

      if (session) {
        const done = session.rows.filter((r) => r.matchStatus !== 'pending').length
        setImportProgress({ done, total: session.rows.length })
      } else if (pending) {
        if (Date.now() - pending.lastActivityAt > PENDING_REVIEW_MAX_AGE_MS) {
          chrome.storage.local.remove(PENDING_REVIEW_KEY)
        } else {
          setPendingCount(pending.items.length)
        }
      }
    })

    // Listen for changes
    const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (IMPORT_SESSION_KEY in changes) {
        const session = changes[IMPORT_SESSION_KEY].newValue as ImportSession | undefined
        if (session) {
          const done = session.rows.filter((r) => r.matchStatus !== 'pending').length
          setImportProgress({ done, total: session.rows.length })
        } else {
          setImportProgress(null)
        }
      }
      if (PENDING_REVIEW_KEY in changes) {
        const pending = changes[PENDING_REVIEW_KEY].newValue as PendingReviewList | undefined
        setPendingCount(pending?.items.length ?? 0)
      }
    }
    chrome.storage.local.onChanged.addListener(listener)
    return () => chrome.storage.local.onChanged.removeListener(listener)
  }, [])

  const openImportTab = useCallback(() => {
    chrome.tabs.create({ url: chrome.runtime.getURL('import/index.html') })
  }, [])

  const dismissPending = useCallback(() => {
    if (confirm('Discard ' + pendingCount + ' unreviewed titles? This can\'t be undone.')) {
      chrome.storage.local.remove(PENDING_REVIEW_KEY)
      setPendingCount(0)
    }
  }, [pendingCount])

  return {
    pendingCount,
    importInProgress: importProgress,
    openImportTab,
    dismissPending,
  }
}
```

- [ ] **Step 2: Create ImportBanner component**

Create `src/sidepanel/components/ImportBanner.tsx`:

```tsx
interface ImportBannerProps {
  importInProgress: { done: number; total: number } | null
  pendingCount: number
  onResume: () => void
  onDismiss: () => void
}

export function ImportBanner({ importInProgress, pendingCount, onResume, onDismiss }: ImportBannerProps) {
  if (importInProgress) {
    return (
      <div style={{
        padding: '8px 12px', background: '#1a2a3a', borderRadius: 6,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontSize: 13, color: '#60a5fa', marginBottom: 8,
      }}>
        <span>Import in progress ({importInProgress.done}/{importInProgress.total})</span>
        <button onClick={onResume} style={{ fontSize: 12, color: '#60a5fa', background: 'none', border: '1px solid #60a5fa44', padding: '2px 8px', borderRadius: 4, cursor: 'pointer' }}>
          Resume
        </button>
      </div>
    )
  }

  if (pendingCount > 0) {
    return (
      <div style={{
        padding: '8px 12px', background: '#1a2a3a', borderRadius: 6,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontSize: 13, color: '#60a5fa', marginBottom: 8,
      }}>
        <span>{pendingCount} titles pending review</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={onResume} style={{ fontSize: 12, color: '#60a5fa', background: 'none', border: '1px solid #60a5fa44', padding: '2px 8px', borderRadius: 4, cursor: 'pointer' }}>
            Resume
          </button>
          <button onClick={onDismiss} style={{ fontSize: 12, color: '#888', background: 'none', border: 'none', padding: '2px 4px', cursor: 'pointer' }}>
            ×
          </button>
        </div>
      </div>
    )
  }

  return null
}
```

- [ ] **Step 3: Add ImportBanner to App.tsx**

In `src/sidepanel/App.tsx`:

1. Import `usePendingReview` and `ImportBanner`
2. Call `usePendingReview()` in the App component
3. Render `<ImportBanner>` in the general view, after the `BackfillIndicator` and before the item list

```tsx
import { usePendingReview } from './hooks/usePendingReview'
import { ImportBanner } from './components/ImportBanner'

// In App component:
const { pendingCount, importInProgress, openImportTab, dismissPending } = usePendingReview()

// In the general view render, after BackfillIndicator:
<ImportBanner
  importInProgress={importInProgress}
  pendingCount={pendingCount}
  onResume={openImportTab}
  onDismiss={dismissPending}
/>
```

- [ ] **Step 4: Add CSV import button to SettingsPage**

In `src/sidepanel/components/SettingsPage.tsx`, add an "Import from CSV" button in the Data Management section, after the existing export/import buttons:

```tsx
<button onClick={() => chrome.tabs.create({ url: chrome.runtime.getURL('import/index.html') })}>
  Import from CSV
</button>
```

Read the exact SettingsPage structure before editing to place the button correctly.

- [ ] **Step 5: Run typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: Both PASS

- [ ] **Step 6: Run full test suite**

Run: `npm test`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/sidepanel/hooks/usePendingReview.ts src/sidepanel/components/ImportBanner.tsx src/sidepanel/App.tsx src/sidepanel/components/SettingsPage.tsx
git commit -m "feat(import): add side panel integration — banner, pending review, settings button"
```

---

## Task 12: Final Verification & Polish

**Files:**
- All files from previous tasks

- [ ] **Step 1: Run full typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 2: Run full lint**

Run: `npm run lint`
Expected: PASS (fix any lint errors)

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: All tests PASS

- [ ] **Step 4: Run production build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 5: Verify build output structure**

Run: `ls -la dist/` and `ls -la dist/import/` and `ls -la dist/sidepanel/`
Expected: Both `dist/import/index.html` and `dist/sidepanel/index.html` exist with their JS chunks

- [ ] **Step 6: Manual smoke test checklist**

Load `dist/` as unpacked extension in Chrome:

1. Side panel shows "Import from CSV" button in Settings
2. Clicking the button opens the import tab
3. Import tab shows file picker on fresh open
4. Upload a test CSV → summary and preview show correctly
5. Start matching → progress bar works, tally updates
6. Pause/resume works
7. Review table shows results with correct tier colors
8. "Similar" modal opens and shows alternatives
9. Continue to confirm → tier checkboxes work
10. Import executes → items appear in side panel
11. Close import tab → side panel shows pending review banner (if applicable)
12. Reopen import tab → session resumes from correct phase

- [ ] **Step 7: Commit any polish fixes**

```bash
git add -A
git commit -m "chore(import): lint fixes and final polish"
```
