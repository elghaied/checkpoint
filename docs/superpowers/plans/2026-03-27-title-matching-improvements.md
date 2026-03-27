# Title Matching & ComicK Enrichment Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify title scoring across all code paths, enrich ComicK items with detail data at save time, and add scored fallbacks to chapter checking and genre backfill.

**Architecture:** Extract the all-vs-all title scoring from migration into a shared `bestTitleScore()` in `anilist.ts`. Add `ENRICH_COMICK` message for detail enrichment at save time. Update fallback functions to score results before accepting.

**Tech Stack:** TypeScript, Vitest, Chrome Extension Manifest V3, React 19

---

## File Map

### Modified Files
| File | Changes |
|------|---------|
| `src/background/anilist.ts` | Add `bestTitleScore()` exported function |
| `src/background/anilist.test.ts` | Tests for `bestTitleScore` |
| `src/background/comick.ts` | Add `enrichComicKResult()` function |
| `src/background/comick.test.ts` | Tests for `enrichComicKResult` |
| `src/shared/types.ts` | Add `ENRICH_COMICK` message type |
| `src/background/index.ts` | Add `ENRICH_COMICK` handler |
| `src/background/migration.ts` | Use `bestTitleScore()` in scoring |
| `src/background/chapterChecker.ts` | Score fallback results with `bestTitleScore`, 0.7 threshold |
| `src/background/genreBackfill.ts` | Score fallback results with `bestTitleScore`, 0.7 threshold |
| `src/sidepanel/services/messaging.ts` | Add `enrichComicK()` wrapper |
| `src/sidepanel/hooks/useAddItem.ts` | Call enrichment before saving ComicK results |
| `src/import/services/messaging.ts` | Add `enrichComicK()` wrapper |
| `src/import/components/ConfirmPanel.tsx` | Call enrichment before saving ComicK matches |

---

## Task 1: Shared `bestTitleScore()` Utility

**Files:**
- Modify: `src/background/anilist.ts`
- Modify: `src/background/anilist.test.ts`

- [ ] **Step 1: Write failing tests for `bestTitleScore`**

Add to `src/background/anilist.test.ts`:

```typescript
import { scorePair, normalise, collectTitles, matchTitle, bestTitleScore } from './anilist'

// ... existing tests ...

describe('bestTitleScore', () => {
  it('returns 1.0 for exact match in both sets', () => {
    expect(bestTitleScore(['Solo Leveling'], ['Solo Leveling'])).toBe(1.0)
  })

  it('finds best match across all combinations', () => {
    const itemTitles = ['Geom Meongneun Swordmaster', 'Sword-Devouring Swordmaster']
    const comickTitles = ['Sword Devouring Swordmaster']
    const score = bestTitleScore(itemTitles, comickTitles)
    // "Sword-Devouring Swordmaster" vs "Sword Devouring Swordmaster" → space-stripped match
    expect(score).toBeGreaterThanOrEqual(0.7)
  })

  it('returns 0 when no titles overlap', () => {
    expect(bestTitleScore(['Attack on Titan'], ['One Piece'])).toBe(0)
  })

  it('skips empty strings', () => {
    expect(bestTitleScore(['', 'Solo Leveling'], ['Solo Leveling', ''])).toBe(1.0)
  })

  it('returns 0 for empty arrays', () => {
    expect(bestTitleScore([], ['Solo Leveling'])).toBe(0)
    expect(bestTitleScore(['Solo Leveling'], [])).toBe(0)
  })

  it('matches Korean title against romanized title', () => {
    const itemTitles = ['나 혼자만 레벨업', 'Solo Leveling']
    const comickTitles = ['Solo Leveling', 'Only I Level Up']
    expect(bestTitleScore(itemTitles, comickTitles)).toBe(1.0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/background/anilist.test.ts`
Expected: FAIL — `bestTitleScore` not exported

- [ ] **Step 3: Implement `bestTitleScore` in `anilist.ts`**

Add after the `scorePair` function (after line ~207):

```typescript
/**
 * Score two sets of titles against each other.
 * Returns the best scorePair() result across all combinations.
 * Useful for comparing an item's full title set against a search result's full title set.
 */
export function bestTitleScore(titlesA: string[], titlesB: string[]): number {
  let best = 0

  for (const a of titlesA) {
    const normA = normalise(a)
    if (!normA) continue
    for (const b of titlesB) {
      const normB = normalise(b)
      if (!normB) continue
      const score = scorePair(normA, normB)
      if (score > best) best = score
      if (best === 1.0) return best
    }
  }

  return best
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/background/anilist.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/background/anilist.ts src/background/anilist.test.ts
git commit -m "feat: add bestTitleScore() utility for all-vs-all title comparison"
```

---

## Task 2: Use `bestTitleScore` in Migration

**Files:**
- Modify: `src/background/migration.ts`

- [ ] **Step 1: Replace `scoreComicKResult` implementation**

In `src/background/migration.ts`, update the import to include `bestTitleScore`:

```typescript
import { normalise, scorePair, bestTitleScore } from './anilist'
```

Replace the `scoreComicKResult` function body:

```typescript
function scoreComicKResult(
  itemTitles: string[],
  comickTitle: string,
  comickAltTitles: string[]
): number {
  return bestTitleScore(itemTitles, [comickTitle, ...comickAltTitles])
}
```

- [ ] **Step 2: Run tests**

Run: `npm run test -- src/background/migration.test.ts`
Expected: ALL PASS (behavior unchanged, just delegating to shared function)

- [ ] **Step 3: Commit**

```bash
git add src/background/migration.ts
git commit -m "refactor: use bestTitleScore in migration scoring"
```

---

## Task 3: `enrichComicKResult` Function + Message Type

**Files:**
- Modify: `src/background/comick.ts`
- Modify: `src/background/comick.test.ts`
- Modify: `src/shared/types.ts`
- Modify: `src/background/index.ts`
- Modify: `src/sidepanel/services/messaging.ts`
- Modify: `src/import/services/messaging.ts`

- [ ] **Step 1: Write failing tests for `enrichComicKResult`**

Add to `src/background/comick.test.ts`:

```typescript
import { searchComicK, fetchComicDetail, fetchBatchComicKInfo, enrichComicKResult } from './comick'

// ... existing tests ...

describe('enrichComicKResult', () => {
  it('returns enrichment data from detail endpoint', async () => {
    mockFetch.mockResolvedValue(mockOkResponse(makeDetailResponse({
      hid: 'enrich-hid',
      slug: 'enrich-slug',
      links: { al: '99999', mal: '88888' },
      md_titles: [{ title: 'Alt One' }, { title: 'Alt Two' }],
      md_comic_md_genres: [
        { md_genres: { name: 'Action', slug: 'action', group: 'Genre' } },
      ],
    })))

    const result = await enrichComicKResult('enrich-slug')

    expect(result).not.toBeNull()
    expect(result!.hid).toBe('enrich-hid')
    expect(result!.slug).toBe('enrich-slug')
    expect(result!.anilistId).toBe('99999')
    expect(result!.altTitles).toContain('Alt One')
    expect(result!.altTitles).toContain('Alt Two')
    expect(result!.genres).toContain('Action')
  })

  it('returns null on error', async () => {
    mockFetch.mockResolvedValue(mockErrorResponse(404))

    const result = await enrichComicKResult('nonexistent')

    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/background/comick.test.ts`
Expected: FAIL — `enrichComicKResult` not exported

- [ ] **Step 3: Implement `enrichComicKResult`**

Add to `src/background/comick.ts`:

```typescript
export interface ComicKEnrichment {
  hid: string
  slug: string
  anilistId: string | null
  altTitles: string[]
  genres: string[]
}

/**
 * Fetch enrichment data for a ComicK result.
 * Used at save time to get richer alt titles, anilistId, and genres.
 */
export async function enrichComicKResult(slug: string): Promise<ComicKEnrichment | null> {
  const detail = await fetchComicDetail(slug)
  if (!detail) return null

  return {
    hid: detail.hid,
    slug: detail.slug,
    anilistId: detail.links.anilistId ?? null,
    altTitles: detail.altTitles,
    genres: detail.genres,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/background/comick.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Add `ENRICH_COMICK` message type**

In `src/shared/types.ts`, add to `MessageRequest` union (after `SEARCH_COMICK`):

```typescript
| { type: 'ENRICH_COMICK'; slug: string }
```

- [ ] **Step 6: Add handler in `src/background/index.ts`**

Add import:
```typescript
import { searchComicK, enrichComicKResult } from './comick'
```

Add handler after `SEARCH_COMICK` case:

```typescript
case 'ENRICH_COMICK': {
  log.debug('ENRICH_COMICK:', message.slug)
  return enrichComicKResult(message.slug)
}
```

- [ ] **Step 7: Add messaging wrappers**

In `src/sidepanel/services/messaging.ts`, add import for `ComicKEnrichment` and the wrapper:

```typescript
import type { ComicKEnrichment } from '@/background/comick'

export async function enrichComicK(slug: string): Promise<ComicKEnrichment | null> {
  return sendMessage<ComicKEnrichment | null>({ type: 'ENRICH_COMICK', slug })
}
```

In `src/import/services/messaging.ts`, add the same:

```typescript
import type { ComicKEnrichment } from '@/background/comick'

export async function enrichComicK(slug: string): Promise<ComicKEnrichment | null> {
  return sendMessage<ComicKEnrichment | null>({ type: 'ENRICH_COMICK', slug })
}
```

- [ ] **Step 8: Run typecheck and tests**

Run: `npm run typecheck && npm run test`
Expected: ALL PASS

- [ ] **Step 9: Commit**

```bash
git add src/background/comick.ts src/background/comick.test.ts src/shared/types.ts src/background/index.ts src/sidepanel/services/messaging.ts src/import/services/messaging.ts
git commit -m "feat: add ENRICH_COMICK message for detail enrichment at save time"
```

---

## Task 4: Enrich ComicK Results in `useAddItem`

**Files:**
- Modify: `src/sidepanel/hooks/useAddItem.ts`

- [ ] **Step 1: Add enrichment call before saving ComicK results**

Add import:
```typescript
import { extractMetadata, searchManga, saveItem, findByTitle, enrichComicK } from '../services/messaging'
```

In the `selectResult` function, after the ComicK field extraction block (`if (result.provider === 'comick')`) and before building the TrackedItem, add enrichment:

```typescript
      // Extract ComicK cross-reference fields if available
      let comickHid: string | null = null
      let comickSlug: string | null = null
      let anilistIdRef: string | null = null
      let enrichedGenres: string[] = result.genres ?? []

      if (result.provider === 'comick') {
        const comickData = result.originalData as ComicKMedia
        comickHid = comickData.hid
        comickSlug = comickData.slug

        // Enrich with detail data for richer alt titles + anilistId + genres
        const enrichment = await enrichComicK(comickData.slug)
        if (enrichment) {
          comickHid = enrichment.hid
          anilistIdRef = enrichment.anilistId
          enrichedGenres = enrichment.genres.length > 0 ? enrichment.genres : enrichedGenres
          // Merge enriched alt titles into altTitles (deduplicated)
          const existingSet = new Set(altTitles.map((t) => t.toLowerCase().trim()))
          for (const t of enrichment.altTitles) {
            if (t && !existingSet.has(t.toLowerCase().trim())) {
              altTitles.push(t)
              existingSet.add(t.toLowerCase().trim())
            }
          }
        }
      }
```

Update the TrackedItem construction to use `enrichedGenres`:

```typescript
        genres: enrichedGenres,
        // ...
        anilistId: anilistIdRef,
```

Also change `anilistIdRef` from `const` to `let` since it's now reassigned.

- [ ] **Step 2: Run typecheck and tests**

Run: `npm run typecheck && npm run test`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add src/sidepanel/hooks/useAddItem.ts
git commit -m "feat: enrich ComicK results with detail data before saving"
```

---

## Task 5: Enrich ComicK Results in CSV Import

**Files:**
- Modify: `src/import/components/ConfirmPanel.tsx`

- [ ] **Step 1: Add enrichment call before saving ComicK matches**

Add import:
```typescript
import { saveItem, updateItem, getCustomTags, saveCustomTag, enrichComicK } from '../services/messaging'
```

In the confirm handler, where the `item` TrackedItem is built for `work.type === 'add'` (around line 288-310), add enrichment after building the item and before calling `saveItem`:

```typescript
        const item: TrackedItem = {
          // ... existing construction ...
        }

        // Enrich ComicK results with detail data
        if (item.provider === 'comick' && match.id) {
          const comickData = match.originalData as ComicKMedia
          const enrichment = await enrichComicK(comickData.slug)
          if (enrichment) {
            item.comickHid = enrichment.hid
            item.comickSlug = enrichment.slug
            item.anilistId = enrichment.anilistId
            if (enrichment.genres.length > 0) {
              item.genres = enrichment.genres
              item.genresBackfilled = true
            }
            // Merge enriched alt titles
            const existingSet = new Set(item.titles.alt.map((t) => t.toLowerCase().trim()))
            for (const t of enrichment.altTitles) {
              if (t && !existingSet.has(t.toLowerCase().trim())) {
                item.titles.alt.push(t)
              }
            }
          }
        }

        try {
          await saveItem(item)
```

Add `ComicKMedia` to imports from `@/shared/types`.

- [ ] **Step 2: Run typecheck and tests**

Run: `npm run typecheck && npm run test`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add src/import/components/ConfirmPanel.tsx
git commit -m "feat: enrich ComicK results in CSV import before saving"
```

---

## Task 6: Score Chapter Checking Fallbacks

**Files:**
- Modify: `src/background/chapterChecker.ts`

- [ ] **Step 1: Update fallback functions to accept item titles and score results**

Add import:
```typescript
import { bestTitleScore } from './anilist'
import { CONFIDENCE_THRESHOLD } from '@/shared/constants'
```

Replace `getComicKChaptersByTitle`:

```typescript
/**
 * Search ComicK by title to get chapter info as fallback.
 * Scores results against all item titles, only accepts >= CONFIDENCE_THRESHOLD.
 */
async function getComicKChaptersByTitle(title: string, itemTitles: string[]): Promise<number | null> {
  try {
    const results = await searchComicK(title)
    if (results.length === 0) return null

    // Score each result and pick the best above threshold
    let bestChapters: number | null = null
    let bestScore = 0

    for (const r of results) {
      const score = bestTitleScore(itemTitles, [r.title, ...r.altTitles])
      if (score > bestScore) {
        bestScore = score
        bestChapters = r.lastChapter ?? null
      }
    }

    if (bestScore < CONFIDENCE_THRESHOLD) {
      log.warn('ComicK fallback: best score', bestScore.toFixed(3), 'below threshold for', title)
      return null
    }

    return bestChapters
  } catch (err) {
    log.error('ComicK fallback search failed for', title, ':', err)
    return null
  }
}
```

Replace `getMangaDexChaptersByTitle`:

```typescript
/**
 * Search MangaDex by title to get chapter info as fallback.
 * Scores results against all item titles, only accepts >= CONFIDENCE_THRESHOLD.
 */
async function getMangaDexChaptersByTitle(title: string, itemTitles: string[]): Promise<number | null> {
  try {
    const results = await searchMangaDex(title)
    if (results.length === 0) return null

    // Score each result and pick the best above threshold
    let bestChapters: number | null = null
    let bestScore = 0

    for (const r of results) {
      const score = bestTitleScore(itemTitles, [r.title, ...r.altTitles])
      if (score > bestScore) {
        bestScore = score
        if (r.lastChapter) {
          const chapters = parseInt(r.lastChapter, 10)
          bestChapters = isNaN(chapters) ? null : chapters
        }
      }
    }

    if (bestScore < CONFIDENCE_THRESHOLD) {
      log.warn('MangaDex fallback: best score', bestScore.toFixed(3), 'below threshold for', title)
      return null
    }

    return bestChapters
  } catch (err) {
    log.error('MangaDex fallback search failed for', title, ':', err)
    return null
  }
}
```

- [ ] **Step 2: Update call sites to pass item titles**

In `handleChapterCheckAlarm`, update the fallback calls (in the batch loop) to pass item titles:

```typescript
        batch.map(async (item) => {
          const itemTitles = [item.titles.main, ...item.titles.alt]
          // Try ComicK first (faster, usually has data)
          const comickChapters = await getComicKChaptersByTitle(item.titles.main, itemTitles)
          if (comickChapters !== null) return comickChapters
          // Fall back to MangaDex
          return getMangaDexChaptersByTitle(item.titles.main, itemTitles)
        })
```

- [ ] **Step 3: Run tests**

Run: `npm run test`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add src/background/chapterChecker.ts
git commit -m "feat: score chapter checking fallback results with bestTitleScore, 0.7 threshold"
```

---

## Task 7: Score Genre Backfill Fallbacks

**Files:**
- Modify: `src/background/genreBackfill.ts`

- [ ] **Step 1: Update `fetchFallbackGenres` to score results**

Add imports:
```typescript
import { bestTitleScore, collectTitles } from './anilist'
import { CONFIDENCE_THRESHOLD } from '@/shared/constants'
```

Replace `fetchFallbackGenres`:

```typescript
async function fetchFallbackGenres(item: TrackedItem): Promise<string[]> {
  const itemTitles = [item.titles.main, ...item.titles.alt]

  // Try ComicK first (best genre data)
  if (item.comickSlug) {
    try {
      const detail = await fetchComicDetail(item.comickSlug)
      if (detail && detail.genres.length > 0) return detail.genres
    } catch (err) {
      log.error('ComicK detail fallback failed for', item.titles.main, ':', err)
    }
  }

  // Try ComicK search by title (scored)
  try {
    const results = await searchComicK(item.titles.main)
    for (const r of results) {
      const score = bestTitleScore(itemTitles, [r.title, ...r.altTitles])
      if (score >= CONFIDENCE_THRESHOLD) {
        const detail = await fetchComicDetail(r.slug)
        if (detail && detail.genres.length > 0) return detail.genres
      }
    }
  } catch {
    // ComicK unavailable, continue to other providers
  }

  if (item.provider === 'anilist' || item.provider === 'comick') {
    try {
      const results = await searchMangaDex(item.titles.main)
      for (const r of results) {
        const score = bestTitleScore(itemTitles, [r.title, ...r.altTitles])
        if (score >= CONFIDENCE_THRESHOLD && r.genres.length > 0) {
          return r.genres
        }
      }
    } catch (err) {
      log.error('MangaDex fallback failed for', item.titles.main, ':', err)
    }
  }

  if (item.provider === 'mangadex') {
    try {
      const results = await searchAniList(item.titles.main)
      for (const r of results) {
        const score = bestTitleScore(itemTitles, [r.title.romaji, r.title.english ?? '', r.title.native ?? '', ...r.synonyms])
        if (score >= CONFIDENCE_THRESHOLD && r.genres.length > 0) {
          return r.genres
        }
      }
    } catch (err) {
      log.error('AniList fallback failed for', item.titles.main, ':', err)
    }
  }

  return []
}
```

- [ ] **Step 2: Run tests**

Run: `npm run test`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add src/background/genreBackfill.ts
git commit -m "feat: score genre backfill fallback results with bestTitleScore, 0.7 threshold"
```

---

## Task 8: Full Integration Verification

**Files:** None (verification only)

- [ ] **Step 1: Run all checks**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: ALL PASS

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: Production build succeeds

- [ ] **Step 3: Fix any issues**

Common issues:
- Missing imports for `ComicKMedia` or `ComicKEnrichment`
- `let` vs `const` for `anilistIdRef` in useAddItem
- Unused imports after refactoring

- [ ] **Step 4: Commit fixes if any**

```bash
git add -A
git commit -m "fix: resolve typecheck and lint issues from title matching improvements"
```

- [ ] **Step 5: Final verification**

Run: `npm run typecheck && npm run lint && npm run test && npm run build`
Expected: ALL PASS
