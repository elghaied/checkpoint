# Checkpoint v0.5.0 — Genres, Tags, Lists & Filtering

## Overview

Four interconnected features that add metadata, organization, and filtering to Checkpoint's manga tracking. Built as a single release in dependency order: Genres → Tags → Lists → Filtering.

## 1. Data Model Changes

### TrackedItem — New Fields

```typescript
genres: string[]           // From API (AniList/MangaDex), normalized to string[]
tags: string[]             // User-defined freeform tags
genresBackfilled: boolean  // True once genre fetch has been attempted (both providers if needed)
```

Both default to `[]` / `false` for backward compatibility.

### New Storage Entries

Stored in `chrome.storage.local` alongside `trackedItems` and `settings`:

```typescript
// Tag registry — autocomplete source + color assignments
customTags: {
  [tagName: string]: { color: string }
}

// Lists
customLists: Array<{
  id: string              // crypto.randomUUID()
  name: string
  type: 'manual' | 'smart'
  itemIds: string[]       // Provider IDs (manual lists only, empty for smart)
  filters: {              // Smart lists only, null for manual
    formats: string[]
    genres: FilterEntry[]
    tags: FilterEntry[]
  } | null
  createdAt: number
  updatedAt: number
}>
```

Where `FilterEntry` captures the tri-state filter mode:

```typescript
interface FilterEntry {
  value: string
  mode: 'and' | 'or' | 'exclude'
}
```

### Tag Color Palette

12 predefined colors, auto-assigned in sequence on tag creation:

```typescript
const TAG_COLORS = [
  '#e94560', '#00d4aa', '#f59e0b', '#8b5cf6',
  '#3b82f6', '#ec4899', '#10b981', '#f97316',
  '#06b6d4', '#84cc16', '#a855f7', '#ef4444',
]
```

Cycles back to start after all 12 are used. Users can override per-tag.

### Export/Import

`ExportedData` expands to include `customTags` and `customLists`. `ExportedItem` gains `genres`, `tags`, and `genresBackfilled` fields to match TrackedItem. Import merges these alongside existing item data using the same last-write-wins strategy.

## 2. API Changes — Genre Fetching

### AniList GraphQL

Add `genres` to both existing queries:

**SEARCH_MANGA_QUERY** (search results):
```graphql
media {
  id, type, format, title { romaji, english, native }
  synonyms, coverImage { large, medium }
  countryOfOrigin, status, chapters
  genres
}
```

**BATCH_MANGA_QUERY** (chapter checker + backfill):
```graphql
media {
  id, status, chapters
  genres
}
```

### MangaDex

Extract from `attributes.tags` array, filtering to `genre` and `theme` groups:

```typescript
manga.attributes.tags
  .filter(tag => ['genre', 'theme'].includes(tag.attributes.group))
  .map(tag => tag.attributes.name.en)
```

### Type Changes

- `AniListMedia` gains `genres: string[]`
- `MangaDexMedia` gains `tags: Array<{ attributes: { name: { en: string }, group: string } }>`
- `UnifiedSearchResult` gains `genres: string[]`

Genres flow through the search → save pipeline automatically: API response → UnifiedSearchResult → TrackedItem.

## 3. Genre Backfill System

Populates genres for existing tracked items that were added before this feature.

### Trigger

On service worker startup, after initial item load completes. Does not compete with chapter check alarms — chapter checking takes priority.

### Flow

```
For each item where genresBackfilled !== true:
  1. Fetch from original provider:
     - AniList: batch query (up to 50 IDs per request)
     - MangaDex: parallel fetches (groups of 5, 250ms delay)
  2. If genres returned → save, set genresBackfilled = true
  3. If empty [] →
     a. Fallback: search the OTHER provider by title
        - AniList item → searchMangaDex(title), take best match's genres
        - MangaDex item → searchAniList(title), take best match's genres
     b. If fallback returns genres → save, set genresBackfilled = true
     c. If fallback also empty → save [], set genresBackfilled = true
```

### Rate Limiting

- AniList batch: up to 50 per query (existing pattern from chapter checker)
- MangaDex: groups of 5, 250ms between batches (existing pattern)
- Fallback title searches: batches of 5, 1.1s delay (existing pattern from chapter checker fallback)

### Progress Indicator

Non-blocking bar at top of side panel: `"Updating metadata... 8/24"`. Disappears when done.

**Delivery mechanism**: The background service writes backfill progress to a `chrome.storage.local` key (`backfillProgress`), and the side panel listens via `chrome.storage.onChanged` — the same pattern used by `useTrackedItems` for real-time UI updates. No new message type needed; this avoids introducing a BG → Panel push pattern that doesn't exist in the current architecture.

```typescript
// Storage key
backfillProgress: { completed: number, total: number, status: 'running' | 'done' } | null
```

The side panel reads this on mount and subscribes to changes. When `status === 'done'`, the indicator disappears and the key can be cleared.

## 4. Custom Tags

### Creation Flow

1. User opens EditModal for an item
2. Tag input field with autocomplete from `customTags` registry
3. Typing a non-existent name shows "Create [name]" option
4. On creation: auto-assign next color from palette, add to `customTags` registry and item's `tags[]`

### Color Override

Each tag pill in EditModal is clickable. Opens a small swatch picker (same 12 palette colors) to change the tag's color. Change applies globally (updates `customTags` registry).

### Tag Management

- Tags persist in `customTags` registry even when removed from all items (for future autocomplete)
- "Manage Tags" accessible from the SettingsPage — rename or fully delete tags
- Renaming a tag cascades: updates the `customTags` registry key, all items' `tags[]` arrays, and any smart list filter entries referencing the old name
- Deleting a tag cascades: removes from the registry, all items' `tags[]` arrays, and any smart list filter entries referencing it

### Message Types

```typescript
GET_CUSTOM_TAGS     // → returns customTags registry
UPDATE_CUSTOM_TAGS  // → update color or rename a tag
DELETE_CUSTOM_TAG   // → remove from registry + all items
```

## 5. Custom Lists

### Two Types

- **Manual list**: hand-picked items via `itemIds: string[]`
- **Smart list**: saved filter criteria, items resolved dynamically at render time

### Navigation

Lists are a **separate view** accessed via a new icon in the Header (same pattern as Settings). The main "All Items" view with format tabs remains untouched.

### Lists View

Vertical list showing all lists with:
- List name
- Item count (manual: `itemIds.length`, smart: computed from filter match)
- Type indicator (icon distinguishing manual vs smart)
- Edit/delete actions

### Creating Lists

- **Manual**: "New List" button → name input → starts empty → use "Add Items" checkbox picker
- **Smart**: created from filter panel's "Save as List" button → pre-populated with current filters → name input

### Default Lists

On first install: "Reading", "Completed", "Plan to Read" — all manual, all empty. User can rename or delete.

### Opening a List

- Tapping a list navigates into it, showing matching items in standard ItemCard layout
- Back button to return to lists view
- Manual lists: "Add Items" button (opens checkbox picker of all tracked titles)
- Smart lists: "Edit Filters" button (opens filter panel with saved criteria)

### Item-List Assignment (Two Entry Points)

1. **From list view**: open list → "Add Items" → checkbox picker → save
2. **From EditModal**: shows which lists the item belongs to → toggle membership

### Removing Items from Manual Lists

- From list view: remove button on each card (removes from list only, item stays tracked)
- From EditModal: untoggle list membership

### Cleanup on Item Deletion

When a tracked item is deleted (`DELETE_ITEM`), its `providerId` must be removed from all manual lists' `itemIds` arrays. This is handled in the storage service's `delete()` method to maintain data integrity — no orphaned IDs in lists.

### Message Types

```typescript
GET_LISTS     // → returns all customLists
CREATE_LIST   // → create manual or smart list
UPDATE_LIST   // → rename, modify filters, add/remove items
DELETE_LIST   // → delete list (tracked items unaffected)
```

## 6. Combined Filtering

### Filter Panel

Collapsible panel below the search bar, toggled by a filter icon. Badge on the icon shows count of active filters.

### Filter Sections

Format filtering remains in the existing `TabBar` component — it is **not** duplicated in the FilterPanel. The FilterPanel contains only:

1. **Genres**: searchable chip picker, shows only genres present in tracked items
2. **Tags**: same pattern, shows custom tags with their colors

The TabBar format filter and FilterPanel genre/tag filters combine with AND logic (e.g. TabBar set to "Manhwa" + FilterPanel genre "Action" = Manhwa titles with Action genre).

### Tri-State Filter Chips

Each genre/tag filter chip cycles through three states on click:

| Icon | State | Color | Meaning |
|------|-------|-------|---------|
| ✓ | AND | Green (#00d4aa) | Must include — item must have this |
| · | OR | Blue (#3b82f6) | Any of — item must have at least one OR'd filter |
| ✕ | Exclude | Red (#e94560) | Exclude — item must NOT have this |

Click cycle: add with ✓ (AND) → click icon → · (OR) → ✕ (Exclude) → remove filter.

Format stays simple OR-only (selecting Manga and Manhwa shows both).

### Filter Logic

- **AND** across filter categories (format AND genres AND tags)
- **Within each category**: filters respect their individual mode
  - All AND filters must match
  - At least one OR filter must match (if any OR filters exist)
  - No Exclude filter may match

### Active Filter Display

Selected filters show as dismissible chips above the results. "Clear all" link to reset. Live result count: "Showing 8 of 42 items."

### Save as List

Button at bottom of filter panel when >= 1 filter is active. Prompts for name, creates a smart list with current filter criteria. The current TabBar format selection is also captured into the smart list's `formats` field, so smart lists can filter by format even though the FilterPanel itself doesn't include format controls.

### Persistence

Filters are session-only — reset on side panel close. Smart lists are the persistence mechanism.

### Cross-View Availability

- Main "All Items" view: full filter panel available
- Manual list detail view: filter panel available to narrow within the list
- Smart list detail view: "Edit Filters" button opens filter panel pre-filled with saved criteria

## 7. New & Modified Components

### New React Components

| Component | Purpose |
|-----------|---------|
| `ListsView` | Main lists view (separate view mode like Settings) |
| `ListDetail` | Inside a specific list — items + add/edit-filters button |
| `ListItemPicker` | Checkbox modal to add tracked items to a manual list |
| `FilterPanel` | Collapsible filter section below search bar |
| `FilterChip` | Individual filter pill with ✓/·/✕ state cycling |
| `TagInput` | Autocomplete input for adding tags in EditModal |
| `TagColorPicker` | Small swatch picker for overriding a tag's color |
| `GenreBadges` | Genre pills displayed on ItemCard |
| `BackfillIndicator` | Non-blocking progress bar for metadata backfill |

### Modified Components

- `App.tsx` — new `'lists'` view mode, filter state management
- `Header` — lists icon button
- `ItemCard` — genre badges display
- `EditModal` — tag input section, list membership section
- `SearchModal` — pass genres through when saving new items

### Modified Backend Files

- `types.ts` — new TrackedItem fields, new message types, FilterEntry, list/tag storage types
- `storageService.ts` — CRUD for customTags, customLists, genre backfill updates
- `anilist.ts` — add `genres` to SEARCH_MANGA_QUERY and BATCH_MANGA_QUERY
- `mangadex.ts` — extract genre + theme tags from response
- `searchService.ts` — pass genres through UnifiedSearchResult
- `background/index.ts` — new message handlers for tags, lists, backfill
- `messaging.ts` — typed wrappers for new message types

## 8. Message Types Summary

| Message | Direction | Purpose |
|---------|-----------|---------|
| `GET_CUSTOM_TAGS` | Panel → BG | Fetch tag registry |
| `UPDATE_CUSTOM_TAGS` | Panel → BG | Update tag color or rename |
| `DELETE_CUSTOM_TAG` | Panel → BG | Remove tag from registry + all items |
| `GET_LISTS` | Panel → BG | Fetch all custom lists |
| `CREATE_LIST` | Panel → BG | Create manual or smart list |
| `UPDATE_LIST` | Panel → BG | Rename, modify filters, add/remove items |
| `DELETE_LIST` | Panel → BG | Delete list (items stay tracked) |
| *(backfillProgress)* | *storage key* | Backfill progress via `chrome.storage.onChanged` |

## 9. Backward Compatibility

- New TrackedItem fields (`genres`, `tags`, `genresBackfilled`) default to `[]`, `[]`, `false`
- Missing fields handled gracefully — no migration script needed, just defaults on read
- `customTags` and `customLists` default to `{}` and `[]` if absent from storage
- Existing import/export continues to work — new fields are additive
- Default lists ("Reading", "Completed", "Plan to Read") created on first access if `customLists` is empty
