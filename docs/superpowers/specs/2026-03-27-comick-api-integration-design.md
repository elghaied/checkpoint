# ComicK API Integration Design

**Date:** 2026-03-27
**Status:** Approved
**Branch:** Feature branch (isolated from main)

## Problem

AniList frequently returns `null` chapter counts, forcing a slow MangaDex fallback that is rate-limited (5 req/sec) and lacks a batch endpoint. This degrades chapter checking reliability and speed.

## Solution

Integrate ComicK (`https://api.comick.dev`) as the **primary provider**, with AniList and MangaDex demoted to fallbacks. Introduce a Provider Adapter pattern for clean separation. Silently migrate existing items to ComicK on extension update.

## Why ComicK

- `last_chapter` always present in search results (no null chapters)
- Cross-provider `links.al` field maps directly to AniList IDs
- Pre-built cover URLs, 41+ multilingual title variants
- Fast responses (~70-300ms), generous rate limit (200 req/min)
- `country` field maps directly to format detection (`jp`/`kr`/`cn`)
- `tachiyomi=true` parameter provides Cloudflare bypass for third-party apps

---

## 1. Provider Adapter Interface & Types

### Provider Types

```typescript
// src/shared/types.ts

export type ProviderName = 'comick' | 'anilist' | 'mangadex'
```

### TrackedItem Changes

```typescript
export interface TrackedItem {
  provider: 'comick' | 'anilist' | 'mangadex'  // widened
  providerId: string   // ComicK: hid (stable unique ID), AniList: numeric ID, MangaDex: UUID
  // ... existing fields unchanged ...

  providerStatus: string | null    // renamed from anilistStatus
  comickHid: string | null         // NEW: ComicK hid (for chapters endpoint)
  comickSlug: string | null        // NEW: ComicK slug (for detail endpoint)
  anilistId: string | null         // NEW: preserved from links.al
}
```

### New ComicKMedia Interface

```typescript
export interface ComicKMedia {
  id: number
  hid: string
  slug: string
  title: string
  country: string              // 'jp', 'kr', 'cn'
  status: number               // 1=Ongoing, 2=Completed, 3=Cancelled, 4=Hiatus
  lastChapter: number | null   // from last_chapter field
  coverUrl: string             // pre-built URL
  altTitles: string[]          // from md_titles
  genres: string[]             // resolved from genre IDs
  links: {                     // cross-provider references
    anilistId?: string
    malId?: string
  }
}
```

### UnifiedSearchResult

```typescript
export interface UnifiedSearchResult {
  provider: 'comick' | 'anilist' | 'mangadex'  // widened
  // ... rest unchanged ...
  originalData: ComicKMedia | AniListMedia | MangaDexMedia
}
```

### Status Mapping

ComicK numeric status → normalized strings:
- `1` → `'RELEASING'`
- `2` → `'FINISHED'`
- `3` → `'CANCELLED'`
- `4` → `'HIATUS'`

### New Message Type

```typescript
| { type: 'SEARCH_COMICK'; query: string }
```

---

## 2. ComicK API Client

### New file: `src/background/comick.ts`

**Base URL:** `https://api.comick.dev`

**Cloudflare strategy (layered):**
1. All requests include `?tachiyomi=true` query parameter
2. Headers: realistic `User-Agent`, `Referer: https://comick.io/`, `Accept: application/json`
3. On 403/503: throw `CloudflareBlockError` so search service falls through to AniList
4. Last resort: fall through to AniList/MangaDex (existing code)

**Functions:**

| Function | Endpoint | Purpose |
|----------|----------|---------|
| `searchComicK(query)` | `GET /v1.0/search/?q=&limit=10&tachiyomi=true` | Primary search |
| `fetchComicDetail(slug)` | `GET /comic/{slug}/?tachiyomi=true` | Get links.al, full genres, hid |
| `fetchBatchComicKInfo(slugs)` | Multiple `GET /comic/{slug}/` | Chapter checking (uses slug from `comickSlug` field) |

**Response normalization:**
- `last_chapter` (float) → `Math.floor()` to integer
- `country` → `getFormatFromCountry()` (new util)
- `cover_url` → used directly
- `md_titles` → extracted into alt titles array
- `genres` (integer IDs) → resolved via cached `/genre/` endpoint call
- `status` (numeric) → `mapComickStatus()` to string

**Genre resolution:** One-time fetch of `/genre/` endpoint, cached in memory (survives for service worker lifetime). Maps genre integer IDs to name strings.

**Caching:** TTLCache (5-min TTL), same pattern as existing providers.

**Rate limiting:** 300ms between requests in batch operations (conservative, well under 200 req/min).

---

## 3. Search Flow

### New chain in `searchService.ts`

```
ComicK (primary) → AniList (fallback 1) → MangaDex (fallback 2)
```

**Algorithm:**
1. Clean query via existing `cleanSearchQuery()`
2. Search ComicK → normalize → score confidence
3. If valid results (>= 0.7 confidence) → return
4. If ComicK threw `CloudflareBlockError` or returned low-confidence → try AniList
5. If AniList has valid results → return
6. If still nothing → try MangaDex
7. Return best low-confidence results from whichever provider had them (top 5)

**Confidence scoring:** Reuses existing `scorePair()` / `calculateConfidence()` unchanged. ComicK's `md_titles` provides rich title variants for good matching.

**New function:** `normalizeComicKResults()` alongside existing provider normalizers.

**Detail enrichment:** When a ComicK result is selected/auto-matched, fetch `/comic/{slug}/` once to get `links.al` (AniList ID), `hid`, and full genre names. This happens at save time, not during search.

---

## 4. All Entry Points

### 4.1 Add New Title (Side Panel → `SEARCH_MANGA`)
- Uses the new 3-provider search chain
- When user selects ComicK result → fetch detail → save with `provider: 'comick'`, `comickHid`, `comickSlug`, `anilistId`

### 4.2 CSV Import (`IMPORT_SEARCH`)
- Same new chain applies automatically
- Existing `importRateLimiter` (75 req/min) unchanged — governs overall import throughput

### 4.3 Chapter Checker (hourly alarm)
- Split items into 3 groups: `comickItems`, `anilistItems`, `mangadexItems`
- **ComicK items:** `fetchBatchComicKInfo(slugs)` — individual `/comic/{slug}/` calls, 5 at a time, 300ms spacing
- **AniList items:** Existing batch GraphQL (up to 50)
- **MangaDex items:** Existing individual fetch (1100ms/5)
- **Null chapter fallback:** AniList null → try ComicK by title first (faster, better data) → then MangaDex

### 4.4 Genre Backfill
- **ComicK items:** Genres from detail endpoint at save time; if needed → fetch `/comic/{slug}/`
- **Fallback order change:** primary provider → ComicK → other provider (ComicK-first instead of cross-provider-first)

### 4.5 Direct Search Messages
- Existing `SEARCH_ANILIST`, `SEARCH_MANGADEX` kept
- New `SEARCH_COMICK` message added
- `SEARCH_MANGA` uses the new 3-provider chain

### 4.6 Export/Import
- `ExportedItem.provider` widened to include `'comick'`
- New fields (`comickHid`, `comickSlug`, `anilistId`) included in export
- Importing old exports works unchanged — items stay on original provider, migration handles them

---

## 5. Silent Migration

### Trigger
- Service worker startup, after alarm setup and genre backfill
- Non-blocking background task
- One-time: sets `comickMigrationComplete` flag in storage

### Algorithm

```
For each item where provider !== 'comick':
  1. Search ComicK by title
  2. For AniList items: check if any result has links.al matching our providerId
     → ID match = confirmed (high confidence)
     → No ID match = use title confidence scoring
  3. For MangaDex items: title confidence scoring only
  4. If confidence >= 0.85 (higher than search threshold):
     → Fetch comic detail for hid, slug, links.al, genres
     → Update item:
       - provider: 'comick'
       - providerId: hid (stable, unique, used as primary key — slug can change)
       - comickHid, comickSlug, anilistId: from detail
       - coverImage: ComicK cover_url
       - latestKnownChapters: from last_chapter
       - genres: from detail (if richer)
       - Preserve: progress, tags, custom lists, notifications, timestamps
  5. If confidence < 0.85: skip, leave on original provider
```

### Rate Limiting
- 5 items at a time, 500ms between batches
- Well under ComicK's 200 req/min

### Safety
- Never deletes data
- If interrupted (service worker restart), resumes on next startup
- Unmatched items continue on original provider unchanged

---

## 6. File Changes

### New Files
| File | Purpose |
|------|---------|
| `src/background/comick.ts` | ComicK API client |
| `src/background/migration.ts` | One-time silent migration |
| `src/background/comick.test.ts` | ComicK client tests |
| `src/background/migration.test.ts` | Migration tests |

### Modified Files
| File | Changes |
|------|---------|
| `src/shared/types.ts` | Widen `provider` union, add `ComicKMedia`, add `comickHid`/`comickSlug`/`anilistId` fields, rename `anilistStatus` → `providerStatus`, add `SEARCH_COMICK` message |
| `src/shared/constants.ts` | Add `COMICK_API_BASE`, `COMICK_RATE_LIMIT_DELAY_MS`, `MIGRATION_CONFIDENCE_THRESHOLD`, `COMICK_BATCH_SIZE` |
| `src/shared/utils.ts` | Add `getFormatFromCountry()`, `mapComickStatus()` |
| `src/shared/utils.test.ts` | Tests for new utils |
| `src/background/searchService.ts` | 3-provider chain, `normalizeComicKResults()`, `CloudflareBlockError` handling |
| `src/background/searchService.test.ts` | Update for 3-provider chain |
| `src/background/chapterChecker.ts` | ComicK branch, ComicK-first null-chapter fallback |
| `src/background/genreBackfill.ts` | ComicK-first fallback, handle ComicK items |
| `src/background/index.ts` | `SEARCH_COMICK` handler, trigger migration |
| `src/sidepanel/services/messaging.ts` | `SEARCH_COMICK` message wrapper |
| `public/manifest.json` | Add host_permissions for `api.comick.dev` and `comick.io` |

### Unchanged
- `src/content/` — metadata extraction is provider-agnostic
- `src/background/anilist.ts` — untouched, works as fallback
- `src/background/mangadex.ts` — untouched, works as fallback
- `src/background/cache.ts`, `retry.ts` — reused as-is
- `src/storage/storageService.ts` — already provider-agnostic
- UI components — render `TrackedItem` generically

---

## 7. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Cloudflare blocks service worker requests | `tachiyomi=true` param + proper headers; fallthrough to AniList/MangaDex |
| ComicK API goes down | 3-provider chain degrades gracefully to AniList → MangaDex |
| Migration matches wrong title | 0.85 threshold + AniList ID verification; unmatched items stay on original provider |
| `last_chapter` is float (e.g. 200.5) | `Math.floor()` for consistency with existing integer-based tracking |
| No batch endpoint | 200 req/min limit + 300ms spacing makes individual fetches viable |
| Genre IDs instead of names | One-time `/genre/` fetch cached in memory |
