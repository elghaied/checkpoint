# Sort Controls, Bulk Actions & Discover Tab

**Date:** 2026-03-27
**Status:** Approved
**Branch:** `feat/comick-api-integration` (continues existing work)

## Overview

Three independent features to improve library management and content discovery:
1. Sort controls + pin to top
2. Bulk actions (selection mode)
3. Discover tab (trending + for you)

---

## Feature 1: Sort Controls + Pin to Top

### Sort Controls

Dropdown in the header area (next to search bar) with options:
- **Last Updated** — current default, sort by `updatedAt` descending
- **Alphabetical (A-Z)** — sort by `titles.main` ascending
- **Chapters Ahead** — sort by `(latestKnownChapters - progress.value)` descending, most behind first
- **Recently Added** — sort by `createdAt` descending

Selected sort persists in `ExtensionSettings`.

### Pin to Top

- Pin icon on each item card
- Pinned items always appear above unpinned items regardless of sort
- Among pinned items, the selected sort still applies
- Visual indicator: pin icon visible on pinned cards

### Data Model

```typescript
// TrackedItem — new field
pinned: boolean  // default false

// ExportedItem — new field
pinned: boolean

// ExtensionSettings — new field
sortOrder: 'updatedAt' | 'alphabetical' | 'chaptersAhead' | 'createdAt'  // default 'updatedAt'
```

### Files Changed

| File | Changes |
|------|---------|
| `src/shared/types.ts` | Add `pinned` to TrackedItem/ExportedItem, `sortOrder` to ExtensionSettings |
| `src/sidepanel/hooks/useTrackedItems.ts` | Apply sort + pin logic |
| `src/sidepanel/components/ItemCard.tsx` | Add pin toggle button |
| `src/sidepanel/components/SortDropdown.tsx` | New — sort selector dropdown |
| `src/sidepanel/components/Header.tsx` or `App.tsx` | Add sort dropdown to header |
| `src/sidepanel/styles/` | Styles for sort dropdown and pin icon |
| `src/storage/storageService.ts` | Handle `pinned` field in export/import |

---

## Feature 2: Bulk Actions

### Activation

- "Select" button in header area (next to sort dropdown)
- Clicking enters selection mode — checkboxes appear on item cards
- Floating action bar at bottom with bulk operations
- "Cancel" exits selection mode, clears selection

### Selection UI

- Checkbox on each card (top-left corner over cover image)
- Action bar shows: "X selected" counter + action buttons
- "Select All" / "Deselect All" toggle

### Bulk Operations

- **Delete** — confirmation dialog ("Delete X items?"), then batch delete
- **Tag** — add/remove a tag to all selected items
- **Add to List** — add all selected to a manual list (list picker)
- **Toggle Notifications** — enable/disable for all selected

### State

Ephemeral React state, no persistence:
```typescript
const [selectionMode, setSelectionMode] = useState(false)
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
```

No new message types — uses existing CRUD in a loop.

### Files Changed

| File | Changes |
|------|---------|
| `src/sidepanel/App.tsx` | Selection mode state, "Select" button, pass selection props |
| `src/sidepanel/components/ItemCard.tsx` | Checkbox overlay in selection mode |
| `src/sidepanel/components/BulkActionBar.tsx` | New — floating action bar at bottom |
| `src/sidepanel/styles/` | Styles for selection mode, checkboxes, action bar |

---

## Feature 3: Discover Tab (Trending + For You)

### Navigation

New "Discover" entry in NavRail alongside General, Lists, Tags, Settings.

### Trending Sub-tab

- Fetches ComicK `/top?type=trending&tachiyomi=true`
- Filterable by type: All / Manga / Manhwa / Manhua (via `comic_types` parameter)
- Card layout: cover, title, rating, chapter count, country badge
- "Track" button on each card — builds TrackedItem from ComicK data, enriches via `ENRICH_COMICK`, saves via `SAVE_ITEM`. Progress starts at 0.
- Load more pagination

### For You Sub-tab

Two sources merged:

**Genre-based trending:**
- Analyze tracked items → extract top 3 most common genres
- Query ComicK `/v1.0/search/?genres={top_genres}&sort=follow&tachiyomi=true`
- Filter out already-tracked titles

**ComicK recommendations:**
- For tracked items with `comickSlug`, use the `recommendations` field from the detail endpoint
- Deduplicate across items, rank by vote count (`up_count`)
- Filter out already-tracked titles

Results from both sources merged, deduped, displayed in same card layout.

### API Endpoints Used

| Source | Endpoint | Parameters |
|--------|----------|------------|
| Trending | `GET /top` | `type=trending`, `comic_types`, `tachiyomi=true` |
| Genre search | `GET /v1.0/search/` | `genres`, `sort=follow`, `tachiyomi=true` |
| Recommendations | `GET /comic/{slug}/` | Already fetched during enrichment |

### Data Flow

- Trending: fetched fresh on tab open, cached for browser session (TTLCache)
- For You: computed from user's genre profile + recommendations, cached for session
- No new storage fields — all computed at view time
- "Track" button: builds TrackedItem from ComicK data, calls `enrichComicK` for detail, then `saveItem`

### Message Types

```typescript
| { type: 'GET_TRENDING'; comicTypes?: string[] }
| { type: 'GET_FOR_YOU' }
```

### Files

| File | Changes |
|------|---------|
| `src/background/discover.ts` | New — trending fetch, "for you" computation |
| `src/background/discover.test.ts` | New — tests for discover service |
| `src/shared/types.ts` | Add `GET_TRENDING`, `GET_FOR_YOU` message types, `DiscoverItem` interface |
| `src/background/index.ts` | Add message handlers |
| `src/sidepanel/services/messaging.ts` | Add `getTrending()`, `getForYou()` wrappers |
| `src/sidepanel/components/DiscoverView.tsx` | New — discover tab with sub-tabs |
| `src/sidepanel/components/DiscoverCard.tsx` | New — card for discover results |
| `src/sidepanel/components/NavRail.tsx` | Add Discover nav entry |
| `src/sidepanel/App.tsx` | Add Discover view routing |
| `src/sidepanel/styles/` | Styles for discover views |
