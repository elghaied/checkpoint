# Title Matching & ComicK Enrichment Improvements

**Date:** 2026-03-27
**Status:** Approved
**Branch:** `feat/comick-api-integration` (continues existing work)

## Problem

Title matching quality varies across code paths. The migration uses comprehensive all-vs-all title scoring, but other parts of the app use simpler approaches. ComicK search results have sparse alt titles. Chapter checking and genre backfill fallbacks accept first results without scoring.

## Solution

1. Shared `bestTitleScore()` utility for consistent all-vs-all title comparison
2. ComicK detail enrichment at save time for richer alt titles + anilistId
3. Scored fallbacks in chapter checking and genre backfill with 0.7 threshold
4. CSV import enrichment for ComicK results

---

## 1. Shared Title Scoring Utility

### New function in `src/background/anilist.ts`

```typescript
export function bestTitleScore(titlesA: string[], titlesB: string[]): number
```

Compares every title in set A against every title in set B using `scorePair()`. Returns the best score across all combinations. Skips empty/falsy strings.

### Usage

Replace ad-hoc scoring in:
- `migration.ts` — `scoreComicKResult()` body becomes a `bestTitleScore()` call
- `chapterChecker.ts` — fallback functions score results before accepting
- `genreBackfill.ts` — fallback searches score results before accepting

`searchService.calculateConfidence()` stays as-is — it already works correctly for its use case (extracted title vs provider titles).

---

## 2. ComicK Detail Enrichment at Save Time

### New message type

```typescript
{ type: 'ENRICH_COMICK'; slug: string }
```

Returns:
```typescript
{
  hid: string
  slug: string
  anilistId: string | null
  altTitles: string[]
  genres: string[]
} | null
```

### New function in `src/background/comick.ts`

```typescript
export async function enrichComicKResult(slug: string): Promise<EnrichmentData | null>
```

Calls `fetchComicDetail(slug)` and returns the enrichment fields. Thin wrapper — the detail fetch already exists.

### Integration points

**`useAddItem.ts` → `selectResult()`:**
- After user selects a ComicK result, before building the TrackedItem
- Call `ENRICH_COMICK` with the slug from `originalData`
- Merge returned altTitles into the item's alt titles (deduplicated)
- Set `comickHid`, `anilistId`, and `genres` from the enrichment
- If enrichment fails (network error), save with what we have (graceful degradation)

**CSV import → `src/import/components/ConfirmPanel.tsx` (line ~312) and `src/import/services/messaging.ts`:**
- Add `enrichComicK` to import messaging service
- In `ConfirmPanel.tsx`, before `saveItem(item)`, if `item.provider === 'comick'`, call `enrichComicK(item.comickSlug)` and merge the returned data
- Same merge logic as above

---

## 3. Chapter Checking Fallbacks

### `getComicKChaptersByTitle(title, itemTitles)`

Currently: searches by title, takes first result, no scoring.

Fix:
- Accept `itemTitles: string[]` parameter (all item titles)
- Score each search result using `bestTitleScore(itemTitles, [result.title, ...result.altTitles])`
- Only accept results scoring >= `CONFIDENCE_THRESHOLD` (0.7)
- Log warning when skipping due to low confidence
- Return best-scoring result's chapter count, or null

### `getMangaDexChaptersByTitle(title, itemTitles)`

Same fix — score results against all item titles, 0.7 threshold.

### Call sites updated

In `handleChapterCheckAlarm`, pass `[item.titles.main, ...item.titles.alt]` to both fallback functions.

---

## 4. Genre Backfill Fallbacks

### `fetchFallbackGenres(item)`

Currently: searches by `item.titles.main`, takes first result blindly.

Fix:
- When searching ComicK/MangaDex/AniList by title, score each result using `bestTitleScore([item.titles.main, ...item.titles.alt], resultTitles)`
- Only use results scoring >= `CONFIDENCE_THRESHOLD` (0.7)
- Log when skipping bad matches

---

## 5. File Changes

### New/Modified
| File | Changes |
|------|---------|
| `src/background/anilist.ts` | Add `bestTitleScore()` function |
| `src/background/migration.ts` | Use `bestTitleScore()` in `scoreComicKResult` |
| `src/background/chapterChecker.ts` | Score fallback results, 0.7 threshold |
| `src/background/genreBackfill.ts` | Score fallback results, 0.7 threshold |
| `src/shared/types.ts` | Add `ENRICH_COMICK` message type |
| `src/background/comick.ts` | Add `enrichComicKResult()` function |
| `src/background/index.ts` | Add `ENRICH_COMICK` handler |
| `src/sidepanel/services/messaging.ts` | Add `enrichComicK()` wrapper |
| `src/sidepanel/hooks/useAddItem.ts` | Call enrichment before saving ComicK results |
| `src/import/components/ConfirmPanel.tsx` | Call enrichment before saving ComicK matches |
| `src/import/services/messaging.ts` | Add `enrichComicK()` wrapper |

### Tests
| File | Changes |
|------|---------|
| `src/background/anilist.test.ts` | Tests for `bestTitleScore` |
| `src/background/comick.test.ts` | Tests for `enrichComicKResult` |

### Unchanged
- `src/background/searchService.ts` — `calculateConfidence` already correct
- `src/shared/constants.ts` — no threshold changes
