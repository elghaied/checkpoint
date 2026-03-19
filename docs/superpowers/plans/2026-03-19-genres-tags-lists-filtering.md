# Genres, Tags, Lists & Filtering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add genre metadata, user-defined tags, custom lists (manual + smart), and a combined filter system to the Checkpoint manga tracker extension.

**Architecture:** Four features built in dependency order. Types and storage are extended first, then API clients pass genres through the search pipeline, a backfill system populates genres for existing items, tags add user-defined metadata, lists provide organizational grouping, and finally a filter panel ties everything together. All new storage follows the existing serialization queue pattern. Backfill progress uses `chrome.storage.onChanged` (no new push pattern).

**Tech Stack:** TypeScript, React 19, CSS (BEM, no modules), Chrome Extension APIs (Manifest V3), Vite, Vitest

**Spec:** `docs/superpowers/specs/2026-03-19-genres-tags-lists-filtering-design.md`

---

## File Structure

### New Files
- `src/shared/filterEngine.ts` — Pure filter logic (AND/OR/Exclude evaluation), no UI dependencies
- `src/background/genreBackfill.ts` — Backfill orchestration: batch fetch, fallback, progress reporting
- `src/sidepanel/hooks/useCustomTags.ts` — Hook for tag registry CRUD
- `src/sidepanel/hooks/useCustomLists.ts` — Hook for list CRUD
- `src/sidepanel/hooks/useBackfillProgress.ts` — Hook listening to `backfillProgress` storage key
- `src/sidepanel/hooks/useFilterPanel.ts` — Filter state management, filter evaluation, save-as-list
- `src/sidepanel/components/FilterPanel.tsx` + `.css` — Collapsible filter UI
- `src/sidepanel/components/FilterChip.tsx` + `.css` — Tri-state filter chip (✓/·/✕)
- `src/sidepanel/components/TagInput.tsx` + `.css` — Autocomplete tag input for EditModal
- `src/sidepanel/components/TagColorPicker.tsx` + `.css` — 12-swatch color picker
- `src/sidepanel/components/GenreBadges.tsx` + `.css` — Genre pills on ItemCard
- `src/sidepanel/components/BackfillIndicator.tsx` + `.css` — Progress bar for backfill
- `src/sidepanel/components/ListsView.tsx` + `.css` — Lists overview page
- `src/sidepanel/components/ListDetail.tsx` + `.css` — Single list view with items
- `src/sidepanel/components/ListItemPicker.tsx` + `.css` — Checkbox modal for adding items to lists
- `src/shared/filterEngine.test.ts` — Tests for filter logic
- `src/background/genreBackfill.test.ts` — Tests for backfill logic
- `src/storage/storageService.tags.test.ts` — Tests for tag storage CRUD
- `src/storage/storageService.lists.test.ts` — Tests for list storage CRUD

### Modified Files
- `src/shared/types.ts` — New fields on TrackedItem, ExportedItem, AniListMedia, MangaDexMedia, UnifiedSearchResult; new interfaces (FilterEntry, CustomList, CustomTagRegistry, BackfillProgress); new message types
- `src/shared/constants.ts` — TAG_COLORS palette, BACKFILL_BATCH_SIZE, DEFAULT_LISTS
- `src/storage/storageService.ts` — Tag CRUD, list CRUD, backfill updates, item deletion cleanup, export/import expansion
- `src/background/anilist.ts` — Add `genres` to SEARCH_MANGA_QUERY and BATCH_MANGA_QUERY; expand BatchMediaResult
- `src/background/mangadex.ts` — Extract genre+theme tags; add `tags` to MangaDexMangaAttributes; expose `extractGenres()`
- `src/background/searchService.ts` — Pass `genres` through normalizeAniListResults and normalizeMangaDexResults
- `src/background/index.ts` — New message handlers for tags, lists; trigger backfill on startup
- `src/sidepanel/services/messaging.ts` — Typed wrappers for new message types
- `src/sidepanel/App.tsx` — New `'lists'` view mode, filter state integration, backfill indicator
- `src/sidepanel/components/Header.tsx` — Lists icon button
- `src/sidepanel/components/ItemCard.tsx` — Genre badges display
- `src/sidepanel/components/EditModal.tsx` — Tag input section, list membership section
- `src/sidepanel/components/SearchModal.tsx` — Pass genres when building TrackedItem from result
- `src/sidepanel/components/SettingsPage.tsx` — "Manage Tags" section
- `src/sidepanel/hooks/useAddItem.ts` — Include genres when building TrackedItem from search result
- `src/storage/storageService.test.ts` — Update existing tests for new fields
- `src/background/searchService.test.ts` — Update to assert genres field
- `src/__mocks__/chrome.ts` — No changes needed (in-memory store handles arbitrary keys)

---

## Task 1: Extend Type System

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/constants.ts`

- [ ] **Step 1: Add new fields to TrackedItem**

In `src/shared/types.ts`, add after line 34 (before the closing `}`):

```typescript
  // Genre & tag fields
  genres: string[]              // From API, normalized
  tags: string[]                // User-defined freeform tags
  genresBackfilled: boolean     // True once genre fetch attempted (both providers if needed)
```

- [ ] **Step 2: Add genres to ExportedItem**

In `src/shared/types.ts`, add after line 68 (after `anilistStatus`):

```typescript
  genres: string[]
  tags: string[]
  genresBackfilled: boolean
```

- [ ] **Step 3: Expand ExportedData**

In `src/shared/types.ts`, modify `ExportedData` to add after `items` (line 76):

```typescript
  customTags: CustomTagRegistry
  customLists: CustomList[]
```

- [ ] **Step 4: Add genres to API response types**

In `src/shared/types.ts`, add `genres: string[]` to `AniListMedia` after line 108 (after `chapters`).

Add `genres: string[]` to `MangaDexMedia` after line 119 (after `lastChapter`).

Add `genres: string[]` to `UnifiedSearchResult` after line 130 (after `chapters`).

- [ ] **Step 5: Add new interfaces**

In `src/shared/types.ts`, add before the `MessageRequest` type (before line 136):

```typescript
// Filter entry for tri-state filtering
export interface FilterEntry {
  value: string
  mode: 'and' | 'or' | 'exclude'
}

// Custom list
export interface CustomList {
  id: string
  name: string
  type: 'manual' | 'smart'
  itemIds: string[]
  filters: {
    formats: string[]
    genres: FilterEntry[]
    tags: FilterEntry[]
  } | null
  createdAt: number
  updatedAt: number
}

// Tag registry
export interface CustomTagRegistry {
  [tagName: string]: { color: string }
}

// Backfill progress
export interface BackfillProgress {
  completed: number
  total: number
  status: 'running' | 'done'
}
```

- [ ] **Step 6: Add new message types**

In `src/shared/types.ts`, add to the `MessageRequest` union (before the closing of the type, after line 156):

```typescript
  // Tags
  | { type: 'GET_CUSTOM_TAGS' }
  | { type: 'UPDATE_CUSTOM_TAGS'; tagName: string; updates: { color?: string; newName?: string } }
  | { type: 'DELETE_CUSTOM_TAG'; tagName: string }
  // Lists
  | { type: 'GET_LISTS' }
  | { type: 'CREATE_LIST'; list: Omit<CustomList, 'id' | 'createdAt' | 'updatedAt'> }
  | { type: 'UPDATE_LIST'; listId: string; updates: Partial<CustomList> }
  | { type: 'DELETE_LIST'; listId: string }
```

- [ ] **Step 7: Add constants**

In `src/shared/constants.ts`, add:

```typescript
// Tag colors
export const TAG_COLORS = [
  '#e94560', '#00d4aa', '#f59e0b', '#8b5cf6',
  '#3b82f6', '#ec4899', '#10b981', '#f97316',
  '#06b6d4', '#84cc16', '#a855f7', '#ef4444',
]

// Backfill
export const BACKFILL_BATCH_SIZE = 5
export const BACKFILL_BATCH_DELAY_MS = 1100

// Default lists
export const DEFAULT_LIST_NAMES = ['Reading', 'Completed', 'Plan to Read']

// Storage keys
export const CUSTOM_TAGS_KEY = 'customTags'
export const CUSTOM_LISTS_KEY = 'customLists'
export const BACKFILL_PROGRESS_KEY = 'backfillProgress'
```

- [ ] **Step 8: Run typecheck**

Run: `npm run typecheck`
Expected: Errors in files that reference TrackedItem/ExportedItem without the new required fields (storageService, searchService, useAddItem, etc.). These will be fixed in subsequent tasks. Verify only expected errors — no syntax issues in types.ts/constants.ts.

- [ ] **Step 9: Commit**

```bash
git add src/shared/types.ts src/shared/constants.ts
git commit -m "feat: add type definitions for genres, tags, lists, and filtering"
```

---

## Task 2: Extend Storage Service — Core + Tags + Lists

**Files:**
- Modify: `src/storage/storageService.ts`
- Create: `src/storage/storageService.tags.test.ts`
- Create: `src/storage/storageService.lists.test.ts`

- [ ] **Step 1: Write tag storage tests**

Create `src/storage/storageService.tags.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { StorageService } from './storageService'
import { resetChromeStorage } from '@/__mocks__/chrome'

describe('StorageService — Custom Tags', () => {
  let service: StorageService

  beforeEach(() => {
    resetChromeStorage()
    service = new StorageService()
  })

  it('returns empty registry when no tags exist', async () => {
    const tags = await service.getCustomTags()
    expect(tags).toEqual({})
  })

  it('saves a new tag with color', async () => {
    await service.saveCustomTag('isekai', '#e94560')
    const tags = await service.getCustomTags()
    expect(tags).toEqual({ isekai: { color: '#e94560' } })
  })

  it('updates tag color', async () => {
    await service.saveCustomTag('isekai', '#e94560')
    await service.updateCustomTag('isekai', { color: '#3b82f6' })
    const tags = await service.getCustomTags()
    expect(tags.isekai.color).toBe('#3b82f6')
  })

  it('renames tag and cascades to items and lists', async () => {
    // Setup: tag on an item + in a smart list filter
    await service.saveCustomTag('old-name', '#e94560')
    const item = makeItem('1', { tags: ['old-name', 'other'] })
    await service.save(item)
    await service.createList({
      name: 'Test',
      type: 'smart',
      itemIds: [],
      filters: { formats: [], genres: [], tags: [{ value: 'old-name', mode: 'and' }] },
    })

    await service.updateCustomTag('old-name', { newName: 'new-name' })

    const tags = await service.getCustomTags()
    expect(tags['new-name']).toBeDefined()
    expect(tags['old-name']).toBeUndefined()

    const items = await service.getAll()
    expect(items[0].tags).toContain('new-name')
    expect(items[0].tags).not.toContain('old-name')

    const lists = await service.getLists()
    expect(lists[0].filters!.tags[0].value).toBe('new-name')
  })

  it('deletes tag and cascades to items and lists', async () => {
    await service.saveCustomTag('doomed', '#e94560')
    const item = makeItem('1', { tags: ['doomed', 'keeper'] })
    await service.save(item)
    await service.createList({
      name: 'Test',
      type: 'smart',
      itemIds: [],
      filters: { formats: [], genres: [], tags: [{ value: 'doomed', mode: 'and' }] },
    })

    await service.deleteCustomTag('doomed')

    const tags = await service.getCustomTags()
    expect(tags['doomed']).toBeUndefined()

    const items = await service.getAll()
    expect(items[0].tags).toEqual(['keeper'])

    const lists = await service.getLists()
    expect(lists[0].filters!.tags).toEqual([])
  })
})

function makeItem(id: string, overrides: Partial<import('@/shared/types').TrackedItem> = {}): import('@/shared/types').TrackedItem {
  return {
    provider: 'anilist',
    providerId: id,
    mediaType: 'manga',
    format: 'MANGA',
    titles: { main: `Test ${id}`, alt: [] },
    coverImage: '',
    progress: { unit: 'chapter', value: '1' },
    lastUrl: '',
    updatedAt: Date.now(),
    createdAt: Date.now(),
    chaptersWhenAdded: null,
    latestKnownChapters: null,
    lastApiCheck: null,
    notificationsEnabled: false,
    anilistStatus: null,
    genres: [],
    tags: [],
    genresBackfilled: false,
    ...overrides,
  }
}
```

- [ ] **Step 2: Write list storage tests**

Create `src/storage/storageService.lists.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { StorageService } from './storageService'
import { resetChromeStorage } from '@/__mocks__/chrome'

describe('StorageService — Custom Lists', () => {
  let service: StorageService

  beforeEach(() => {
    resetChromeStorage()
    service = new StorageService()
  })

  it('returns empty array when no lists exist', async () => {
    const lists = await service.getLists()
    expect(lists).toEqual([])
  })

  it('creates a manual list with generated id and timestamps', async () => {
    const list = await service.createList({
      name: 'Reading',
      type: 'manual',
      itemIds: [],
      filters: null,
    })
    expect(list.id).toBeTruthy()
    expect(list.name).toBe('Reading')
    expect(list.createdAt).toBeGreaterThan(0)
  })

  it('creates a smart list with filters', async () => {
    const list = await service.createList({
      name: 'Action Manhwa',
      type: 'smart',
      itemIds: [],
      filters: {
        formats: ['MANHWA'],
        genres: [{ value: 'Action', mode: 'and' }],
        tags: [],
      },
    })
    expect(list.type).toBe('smart')
    expect(list.filters!.genres[0].value).toBe('Action')
  })

  it('updates a list name', async () => {
    const list = await service.createList({
      name: 'Old Name',
      type: 'manual',
      itemIds: [],
      filters: null,
    })
    await service.updateList(list.id, { name: 'New Name' })
    const lists = await service.getLists()
    expect(lists[0].name).toBe('New Name')
  })

  it('adds and removes items from manual list', async () => {
    const list = await service.createList({
      name: 'Favorites',
      type: 'manual',
      itemIds: ['item-1'],
      filters: null,
    })
    await service.updateList(list.id, { itemIds: ['item-1', 'item-2'] })
    let lists = await service.getLists()
    expect(lists[0].itemIds).toEqual(['item-1', 'item-2'])

    await service.updateList(list.id, { itemIds: ['item-2'] })
    lists = await service.getLists()
    expect(lists[0].itemIds).toEqual(['item-2'])
  })

  it('deletes a list', async () => {
    const list = await service.createList({
      name: 'Temp',
      type: 'manual',
      itemIds: [],
      filters: null,
    })
    await service.deleteList(list.id)
    const lists = await service.getLists()
    expect(lists).toEqual([])
  })

  it('cleans up item from lists on item deletion', async () => {
    const list = await service.createList({
      name: 'Faves',
      type: 'manual',
      itemIds: ['item-to-delete', 'item-to-keep'],
      filters: null,
    })

    const item = makeItem('item-to-delete')
    await service.save(item)
    await service.delete('item-to-delete')

    const lists = await service.getLists()
    expect(lists[0].itemIds).toEqual(['item-to-keep'])
  })
})

function makeItem(id: string): import('@/shared/types').TrackedItem {
  return {
    provider: 'anilist',
    providerId: id,
    mediaType: 'manga',
    format: 'MANGA',
    titles: { main: `Test ${id}`, alt: [] },
    coverImage: '',
    progress: { unit: 'chapter', value: '1' },
    lastUrl: '',
    updatedAt: Date.now(),
    createdAt: Date.now(),
    chaptersWhenAdded: null,
    latestKnownChapters: null,
    lastApiCheck: null,
    notificationsEnabled: false,
    anilistStatus: null,
    genres: [],
    tags: [],
    genresBackfilled: false,
  }
}
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm run test -- --run src/storage/storageService.tags.test.ts src/storage/storageService.lists.test.ts`
Expected: FAIL — methods `getCustomTags`, `saveCustomTag`, `createList`, etc. do not exist yet.

- [ ] **Step 4: Add storage key helpers and tag methods to StorageService**

In `src/storage/storageService.ts`, add after `SETTINGS_KEY` (line 4):

```typescript
const CUSTOM_TAGS_KEY = 'customTags'
const CUSTOM_LISTS_KEY = 'customLists'
const BACKFILL_PROGRESS_KEY = 'backfillProgress'
```

Add helper functions after `writeSettings` (after line 59):

```typescript
function readCustomTags(): Promise<import('@/shared/types').CustomTagRegistry> {
  return new Promise((resolve) => {
    chrome.storage.local.get(CUSTOM_TAGS_KEY, (result) => {
      resolve((result[CUSTOM_TAGS_KEY] as import('@/shared/types').CustomTagRegistry) ?? {})
    })
  })
}

function writeCustomTags(tags: import('@/shared/types').CustomTagRegistry): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [CUSTOM_TAGS_KEY]: tags }, resolve)
  })
}

function readLists(): Promise<import('@/shared/types').CustomList[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get(CUSTOM_LISTS_KEY, (result) => {
      resolve((result[CUSTOM_LISTS_KEY] as import('@/shared/types').CustomList[]) ?? [])
    })
  })
}

function writeLists(lists: import('@/shared/types').CustomList[]): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [CUSTOM_LISTS_KEY]: lists }, resolve)
  })
}
```

Add to the `StorageService` class (before the export/import section):

```typescript
  // -------------------------------------------------------------------------
  // Custom Tags
  // -------------------------------------------------------------------------

  async getCustomTags(): Promise<import('@/shared/types').CustomTagRegistry> {
    return readCustomTags()
  }

  async saveCustomTag(name: string, color: string): Promise<void> {
    return serialize(async () => {
      const tags = await readCustomTags()
      tags[name] = { color }
      await writeCustomTags(tags)
    })
  }

  async updateCustomTag(name: string, updates: { color?: string; newName?: string }): Promise<void> {
    return serialize(async () => {
      const tags = await readCustomTags()
      if (!tags[name]) return

      if (updates.newName && updates.newName !== name) {
        // Rename: move entry, cascade to items and lists
        tags[updates.newName] = { color: updates.color ?? tags[name].color }
        delete tags[name]
        await writeCustomTags(tags)

        // Cascade to items
        const items = await readAll()
        let itemsChanged = false
        for (const item of items) {
          const idx = item.tags.indexOf(name)
          if (idx !== -1) {
            item.tags[idx] = updates.newName
            itemsChanged = true
          }
        }
        if (itemsChanged) await writeAll(items)

        // Cascade to smart list filters
        const lists = await readLists()
        let listsChanged = false
        for (const list of lists) {
          if (list.filters) {
            for (const entry of list.filters.tags) {
              if (entry.value === name) {
                entry.value = updates.newName
                listsChanged = true
              }
            }
          }
        }
        if (listsChanged) await writeLists(lists)
      } else if (updates.color) {
        tags[name] = { color: updates.color }
        await writeCustomTags(tags)
      }
    })
  }

  async deleteCustomTag(name: string): Promise<void> {
    return serialize(async () => {
      const tags = await readCustomTags()
      delete tags[name]
      await writeCustomTags(tags)

      // Cascade: remove from all items
      const items = await readAll()
      let itemsChanged = false
      for (const item of items) {
        const idx = item.tags.indexOf(name)
        if (idx !== -1) {
          item.tags.splice(idx, 1)
          itemsChanged = true
        }
      }
      if (itemsChanged) await writeAll(items)

      // Cascade: remove from smart list filters
      const lists = await readLists()
      let listsChanged = false
      for (const list of lists) {
        if (list.filters) {
          const before = list.filters.tags.length
          list.filters.tags = list.filters.tags.filter((e) => e.value !== name)
          if (list.filters.tags.length !== before) listsChanged = true
        }
      }
      if (listsChanged) await writeLists(lists)
    })
  }

  // -------------------------------------------------------------------------
  // Custom Lists
  // -------------------------------------------------------------------------

  async getLists(): Promise<import('@/shared/types').CustomList[]> {
    return readLists()
  }

  async createList(
    input: Omit<import('@/shared/types').CustomList, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<import('@/shared/types').CustomList> {
    const list: import('@/shared/types').CustomList = {
      ...input,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    return serialize(async () => {
      const lists = await readLists()
      lists.push(list)
      await writeLists(lists)
      return list
    })
  }

  async updateList(
    listId: string,
    updates: Partial<import('@/shared/types').CustomList>
  ): Promise<void> {
    return serialize(async () => {
      const lists = await readLists()
      const index = lists.findIndex((l) => l.id === listId)
      if (index === -1) return
      lists[index] = {
        ...lists[index],
        ...updates,
        id: lists[index].id, // protect ID
        updatedAt: Date.now(),
      }
      await writeLists(lists)
    })
  }

  async deleteList(listId: string): Promise<void> {
    return serialize(async () => {
      const lists = await readLists()
      await writeLists(lists.filter((l) => l.id !== listId))
    })
  }

  // -------------------------------------------------------------------------
  // Backfill progress
  // -------------------------------------------------------------------------

  async writeBackfillProgress(progress: import('@/shared/types').BackfillProgress | null): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [BACKFILL_PROGRESS_KEY]: progress }, resolve)
    })
  }

  async getBackfillProgress(): Promise<import('@/shared/types').BackfillProgress | null> {
    return new Promise((resolve) => {
      chrome.storage.local.get(BACKFILL_PROGRESS_KEY, (result) => {
        resolve((result[BACKFILL_PROGRESS_KEY] as import('@/shared/types').BackfillProgress) ?? null)
      })
    })
  }
```

- [ ] **Step 5: Update delete() to clean up list references**

Modify the existing `delete` method in `storageService.ts` (currently lines 141-146):

```typescript
  async delete(providerId: string): Promise<void> {
    return serialize(async () => {
      const items = await readAll()
      await writeAll(items.filter((item) => item.providerId !== providerId))

      // Clean up from manual lists
      const lists = await readLists()
      let listsChanged = false
      for (const list of lists) {
        if (list.type === 'manual') {
          const before = list.itemIds.length
          list.itemIds = list.itemIds.filter((id) => id !== providerId)
          if (list.itemIds.length !== before) listsChanged = true
        }
      }
      if (listsChanged) await writeLists(lists)
    })
  }
```

- [ ] **Step 6: Update exportData and importData for new fields**

Update `exportData()` to include `genres`, `tags`, `genresBackfilled` in `ExportedItem` mapping, and add `customTags` + `customLists` to the returned object.

Update `importData()` to merge `customTags` (union, incoming wins on conflict) and `customLists` (append new ones by ID, skip existing). New items from import should default `genres: []`, `tags: []`, `genresBackfilled: false` if not present.

- [ ] **Step 7: Run tag and list tests**

Run: `npm run test -- --run src/storage/storageService.tags.test.ts src/storage/storageService.lists.test.ts`
Expected: All tests PASS.

- [ ] **Step 8: Run full test suite**

Run: `npm run test -- --run`
Expected: Existing tests may need small updates for new required TrackedItem fields in test fixtures (add `genres: [], tags: [], genresBackfilled: false`). Fix any failures.

- [ ] **Step 9: Commit**

```bash
git add src/storage/storageService.ts src/storage/storageService.tags.test.ts src/storage/storageService.lists.test.ts
git commit -m "feat: add tag and list CRUD to storage service with cascade logic"
```

---

## Task 3: Update API Clients — Genre Extraction

**Files:**
- Modify: `src/background/anilist.ts`
- Modify: `src/background/mangadex.ts`
- Modify: `src/background/searchService.ts`
- Modify: `src/background/searchService.test.ts`
- Modify: `src/background/anilist.test.ts`

- [ ] **Step 1: Add `genres` to AniList GraphQL queries**

In `src/background/anilist.ts`:

Add `genres` to `SEARCH_MANGA_QUERY` (after `chapters` on line 35):
```graphql
        chapters
        genres
```

Add `genres` to `BATCH_MANGA_QUERY` (after `chapters` on line 47):
```graphql
        chapters
        genres
```

Add `genres: string[]` to the `BatchMediaResult` interface (after `chapters` on line 71):
```typescript
  genres: string[]
```

In `fetchBatchChapterInfo`, include genres in the result map (update lines 302-307):
```typescript
  for (const m of media) {
    results.set(String(m.id), {
      id: String(m.id),
      status: m.status,
      chapters: m.chapters,
      genres: m.genres ?? [],
    })
  }
```

Update `BatchChapterResult` to include `genres: string[]`.

- [ ] **Step 2: Extract genres from MangaDex responses**

In `src/background/mangadex.ts`:

Add a `tags` field to `MangaDexMangaAttributes` (after line 29, after `lastChapter`):
```typescript
  tags: Array<{
    attributes: {
      name: { en?: string }
      group: string
    }
  }>
```

Add a new helper function after `extractCoverUrl` (after line 79):
```typescript
/**
 * Extract genre and theme tags from MangaDex tag array.
 */
export function extractGenres(tags: MangaDexMangaAttributes['tags']): string[] {
  return tags
    .filter((tag) => tag.attributes.group === 'genre' || tag.attributes.group === 'theme')
    .map((tag) => tag.attributes.name.en)
    .filter((name): name is string => !!name)
}
```

Update the `searchMangaDex` result mapping (around line 123-131) to include genres:
```typescript
  const results: MangaDexMedia[] = json.data.map((manga) => ({
    id: manga.id,
    title: extractPrimaryTitle(manga.attributes.title),
    altTitles: extractAltTitles(manga.attributes.altTitles),
    coverUrl: extractCoverUrl(manga.id, manga.relationships),
    originalLanguage: manga.attributes.originalLanguage,
    status: manga.attributes.status,
    lastChapter: manga.attributes.lastChapter,
    genres: extractGenres(manga.attributes.tags ?? []),
  }))
```

- [ ] **Step 3: Pass genres through search service normalization**

In `src/background/searchService.ts`:

Update `normalizeAniListResults` (around line 36-50) to include `genres`:
```typescript
      genres: media.genres ?? [],
```
Add it after `chapters: media.chapters,` in the returned object.

Update `normalizeMangaDexResults` (around line 67-81) to include `genres`:
```typescript
      genres: manga.genres ?? [],
```
Add it after the chapters line.

- [ ] **Step 4: Update test fixtures**

In `src/background/anilist.test.ts`, add `genres: ['Action', 'Fantasy']` (or `genres: []`) to all AniListMedia fixtures in tests.

In `src/background/searchService.test.ts`, add `genres: []` to all mock media objects. Add a test that verifies genres flow through `searchWithFallback`:

```typescript
it('includes genres in unified results', async () => {
  vi.mocked(searchAniList).mockResolvedValueOnce([
    makeAniListMedia({ genres: ['Action', 'Romance'] }),
  ])
  const results = await searchWithFallback('test', 'test')
  expect(results[0].genres).toEqual(['Action', 'Romance'])
})
```

- [ ] **Step 5: Run tests**

Run: `npm run test -- --run src/background/`
Expected: All tests PASS.

- [ ] **Step 6: Run typecheck**

Run: `npm run typecheck`
Expected: Remaining errors should only be in sidepanel files (not yet updated). No errors in background/.

- [ ] **Step 7: Commit**

```bash
git add src/background/anilist.ts src/background/mangadex.ts src/background/searchService.ts src/background/searchService.test.ts src/background/anilist.test.ts
git commit -m "feat: extract genres from AniList and MangaDex, pass through search pipeline"
```

---

## Task 4: Genre Backfill System

**Files:**
- Create: `src/background/genreBackfill.ts`
- Create: `src/background/genreBackfill.test.ts`
- Modify: `src/background/index.ts`

- [ ] **Step 1: Write backfill tests**

Create `src/background/genreBackfill.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runGenreBackfill } from './genreBackfill'

// Mock dependencies
vi.mock('@/storage', () => ({
  storageService: {
    getAll: vi.fn(),
    update: vi.fn(),
    writeBackfillProgress: vi.fn(),
  },
}))
vi.mock('./anilist', () => ({
  fetchBatchChapterInfo: vi.fn(),
  searchAniList: vi.fn(),
}))
vi.mock('./mangadex', () => ({
  searchMangaDex: vi.fn(),
  extractGenres: vi.fn(),
}))

import { storageService } from '@/storage'
import { fetchBatchChapterInfo } from './anilist'
import { searchMangaDex } from './mangadex'

describe('runGenreBackfill', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('skips items that are already backfilled', async () => {
    vi.mocked(storageService.getAll).mockResolvedValue([
      makeItem('1', { genresBackfilled: true, genres: ['Action'] }),
    ])
    await runGenreBackfill()
    expect(storageService.update).not.toHaveBeenCalled()
  })

  it('fetches genres from AniList for anilist-sourced items', async () => {
    vi.mocked(storageService.getAll).mockResolvedValue([
      makeItem('123', { provider: 'anilist', genresBackfilled: false }),
    ])
    vi.mocked(fetchBatchChapterInfo).mockResolvedValue(
      new Map([['123', { id: '123', status: 'RELEASING', chapters: 50, genres: ['Action', 'Fantasy'] }]])
    )
    await runGenreBackfill()
    expect(storageService.update).toHaveBeenCalledWith('123', {
      genres: ['Action', 'Fantasy'],
      genresBackfilled: true,
    })
  })

  it('falls back to MangaDex when AniList returns empty genres', async () => {
    vi.mocked(storageService.getAll).mockResolvedValue([
      makeItem('456', { provider: 'anilist', genresBackfilled: false, titles: { main: 'One Piece', alt: [] } }),
    ])
    vi.mocked(fetchBatchChapterInfo).mockResolvedValue(
      new Map([['456', { id: '456', status: 'RELEASING', chapters: 100, genres: [] }]])
    )
    vi.mocked(searchMangaDex).mockResolvedValue([
      { id: 'md-1', title: 'One Piece', altTitles: [], coverUrl: '', originalLanguage: 'ja', status: 'ongoing', lastChapter: '100', genres: ['Action', 'Adventure'] },
    ])
    await runGenreBackfill()
    expect(storageService.update).toHaveBeenCalledWith('456', {
      genres: ['Action', 'Adventure'],
      genresBackfilled: true,
    })
  })

  it('marks as backfilled with empty genres when both providers return nothing', async () => {
    vi.mocked(storageService.getAll).mockResolvedValue([
      makeItem('789', { provider: 'anilist', genresBackfilled: false, titles: { main: 'Unknown', alt: [] } }),
    ])
    vi.mocked(fetchBatchChapterInfo).mockResolvedValue(
      new Map([['789', { id: '789', status: 'RELEASING', chapters: 10, genres: [] }]])
    )
    vi.mocked(searchMangaDex).mockResolvedValue([])
    await runGenreBackfill()
    expect(storageService.update).toHaveBeenCalledWith('789', {
      genres: [],
      genresBackfilled: true,
    })
  })

  it('reports progress via writeBackfillProgress', async () => {
    vi.mocked(storageService.getAll).mockResolvedValue([
      makeItem('1', { genresBackfilled: false }),
    ])
    vi.mocked(fetchBatchChapterInfo).mockResolvedValue(
      new Map([['1', { id: '1', status: 'RELEASING', chapters: 5, genres: ['Action'] }]])
    )
    await runGenreBackfill()
    expect(storageService.writeBackfillProgress).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'running' })
    )
    expect(storageService.writeBackfillProgress).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'done' })
    )
  })
})

function makeItem(id: string, overrides: Partial<import('@/shared/types').TrackedItem> = {}): import('@/shared/types').TrackedItem {
  return {
    provider: 'anilist',
    providerId: id,
    mediaType: 'manga',
    format: 'MANGA',
    titles: { main: `Test ${id}`, alt: [] },
    coverImage: '',
    progress: { unit: 'chapter', value: '1' },
    lastUrl: '',
    updatedAt: Date.now(),
    createdAt: Date.now(),
    chaptersWhenAdded: null,
    latestKnownChapters: null,
    lastApiCheck: null,
    notificationsEnabled: false,
    anilistStatus: null,
    genres: [],
    tags: [],
    genresBackfilled: false,
    ...overrides,
  }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- --run src/background/genreBackfill.test.ts`
Expected: FAIL — `runGenreBackfill` does not exist.

- [ ] **Step 3: Implement genreBackfill.ts**

Create `src/background/genreBackfill.ts`:

```typescript
import { storageService } from '@/storage'
import { fetchBatchChapterInfo, searchAniList } from './anilist'
import { searchMangaDex } from './mangadex'
import { createLogger } from '@/shared/logger'
import { BACKFILL_BATCH_SIZE, BACKFILL_BATCH_DELAY_MS } from '@/shared/constants'
import type { TrackedItem } from '@/shared/types'

const log = createLogger('backfill')

/**
 * Backfill genres for existing tracked items that don't have them yet.
 * Fetches from the item's original provider first, then falls back to the other.
 * Reports progress via chrome.storage.local (backfillProgress key).
 */
export async function runGenreBackfill(): Promise<void> {
  const allItems = await storageService.getAll()
  const needsBackfill = allItems.filter((item) => !item.genresBackfilled)

  if (needsBackfill.length === 0) {
    log.debug('No items need genre backfill')
    return
  }

  log.info(`Starting genre backfill for ${needsBackfill.length} items`)

  await storageService.writeBackfillProgress({
    completed: 0,
    total: needsBackfill.length,
    status: 'running',
  })

  // Split by provider
  const anilistItems = needsBackfill.filter((i) => i.provider === 'anilist')
  const mangadexItems = needsBackfill.filter((i) => i.provider === 'mangadex')

  let completed = 0

  // Process AniList items via batch query
  if (anilistItems.length > 0) {
    const ids = anilistItems.map((i) => i.providerId)
    const batchResult = await fetchBatchChapterInfo(ids)

    for (const item of anilistItems) {
      const result = batchResult.get(item.providerId)
      let genres = result?.genres ?? []

      // Fallback to MangaDex if AniList returned empty genres
      if (genres.length === 0) {
        genres = await fallbackSearchGenres(item, 'mangadex')
      }

      await storageService.update(item.providerId, {
        genres,
        genresBackfilled: true,
      })

      completed++
      await storageService.writeBackfillProgress({
        completed,
        total: needsBackfill.length,
        status: 'running',
      })
    }
  }

  // Process MangaDex items individually (no batch endpoint for full data)
  for (let i = 0; i < mangadexItems.length; i += BACKFILL_BATCH_SIZE) {
    const batch = mangadexItems.slice(i, i + BACKFILL_BATCH_SIZE)

    const results = await Promise.allSettled(
      batch.map(async (item) => {
        // Fetch from MangaDex by searching for the title
        const mdResults = await searchMangaDex(item.titles.main)
        const match = mdResults.find((r) => r.id === item.providerId)
        let genres = match?.genres ?? []

        // Fallback to AniList if MangaDex returned empty
        if (genres.length === 0) {
          genres = await fallbackSearchGenres(item, 'anilist')
        }

        await storageService.update(item.providerId, {
          genres,
          genresBackfilled: true,
        })
      })
    )

    completed += batch.length
    await storageService.writeBackfillProgress({
      completed,
      total: needsBackfill.length,
      status: 'running',
    })

    // Rate limit between batches
    if (i + BACKFILL_BATCH_SIZE < mangadexItems.length) {
      await new Promise((resolve) => setTimeout(resolve, BACKFILL_BATCH_DELAY_MS))
    }
  }

  await storageService.writeBackfillProgress({
    completed: needsBackfill.length,
    total: needsBackfill.length,
    status: 'done',
  })

  log.info('Genre backfill complete')
}

/**
 * Search the other provider by title to get genres as a fallback.
 */
async function fallbackSearchGenres(
  item: TrackedItem,
  fallbackProvider: 'anilist' | 'mangadex'
): Promise<string[]> {
  try {
    if (fallbackProvider === 'mangadex') {
      const results = await searchMangaDex(item.titles.main)
      if (results.length > 0) {
        return results[0].genres ?? []
      }
    } else {
      const results = await searchAniList(item.titles.main)
      if (results.length > 0) {
        return results[0].genres ?? []
      }
    }
  } catch (err) {
    log.error('Fallback genre search failed for', item.titles.main, err)
  }
  return []
}
```

- [ ] **Step 4: Trigger backfill on service worker startup**

In `src/background/index.ts`, add import:
```typescript
import { runGenreBackfill } from './genreBackfill'
```

Add after `setupChapterCheckAlarm()` (after line 19):
```typescript
// Run genre backfill for existing items (non-blocking)
runGenreBackfill().catch((err) => log.error('Genre backfill failed:', err))
```

- [ ] **Step 5: Run tests**

Run: `npm run test -- --run src/background/genreBackfill.test.ts`
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/background/genreBackfill.ts src/background/genreBackfill.test.ts src/background/index.ts
git commit -m "feat: add genre backfill system with dual-provider fallback"
```

---

## Task 5: Filter Engine (Pure Logic)

**Files:**
- Create: `src/shared/filterEngine.ts`
- Create: `src/shared/filterEngine.test.ts`

- [ ] **Step 1: Write filter engine tests**

Create `src/shared/filterEngine.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { applyFilters } from './filterEngine'
import type { TrackedItem, FilterEntry } from '@/shared/types'

describe('applyFilters', () => {
  const items = [
    makeItem('1', { format: 'MANHWA', genres: ['Action', 'Romance'], tags: ['S-tier'] }),
    makeItem('2', { format: 'MANGA', genres: ['Action', 'Horror'], tags: ['comfort'] }),
    makeItem('3', { format: 'MANHWA', genres: ['Romance', 'Fantasy'], tags: ['S-tier', 'comfort'] }),
    makeItem('4', { format: 'MANHUA', genres: ['Action'], tags: [] }),
  ]

  it('returns all items when no filters active', () => {
    expect(applyFilters(items, { formats: [], genres: [], tags: [] })).toHaveLength(4)
  })

  it('filters by format (OR logic)', () => {
    const result = applyFilters(items, { formats: ['MANHWA'], genres: [], tags: [] })
    expect(result.map((i) => i.providerId)).toEqual(['1', '3'])
  })

  it('filters by genre AND', () => {
    const genres: FilterEntry[] = [{ value: 'Action', mode: 'and' }]
    const result = applyFilters(items, { formats: [], genres, tags: [] })
    expect(result.map((i) => i.providerId)).toEqual(['1', '2', '4'])
  })

  it('filters by genre OR', () => {
    const genres: FilterEntry[] = [
      { value: 'Romance', mode: 'or' },
      { value: 'Horror', mode: 'or' },
    ]
    const result = applyFilters(items, { formats: [], genres, tags: [] })
    expect(result.map((i) => i.providerId)).toEqual(['1', '2', '3'])
  })

  it('filters by genre Exclude', () => {
    const genres: FilterEntry[] = [{ value: 'Horror', mode: 'exclude' }]
    const result = applyFilters(items, { formats: [], genres, tags: [] })
    expect(result.map((i) => i.providerId)).toEqual(['1', '3', '4'])
  })

  it('combines AND + OR + Exclude in genres', () => {
    const genres: FilterEntry[] = [
      { value: 'Action', mode: 'and' },
      { value: 'Romance', mode: 'or' },
      { value: 'Fantasy', mode: 'or' },
      { value: 'Horror', mode: 'exclude' },
    ]
    // Must have Action AND (Romance OR Fantasy) AND NOT Horror
    const result = applyFilters(items, { formats: [], genres, tags: [] })
    expect(result.map((i) => i.providerId)).toEqual(['1'])
  })

  it('combines format + genre + tag filters (AND across categories)', () => {
    const result = applyFilters(items, {
      formats: ['MANHWA'],
      genres: [{ value: 'Romance', mode: 'and' }],
      tags: [{ value: 'S-tier', mode: 'and' }],
    })
    expect(result.map((i) => i.providerId)).toEqual(['1', '3'])
  })

  it('tag exclude works', () => {
    const result = applyFilters(items, {
      formats: [],
      genres: [],
      tags: [{ value: 'comfort', mode: 'exclude' }],
    })
    expect(result.map((i) => i.providerId)).toEqual(['1', '4'])
  })
})

function makeItem(id: string, overrides: Partial<TrackedItem> = {}): TrackedItem {
  return {
    provider: 'anilist',
    providerId: id,
    mediaType: 'manga',
    format: 'MANGA',
    titles: { main: `Test ${id}`, alt: [] },
    coverImage: '',
    progress: { unit: 'chapter', value: '1' },
    lastUrl: '',
    updatedAt: Date.now(),
    createdAt: Date.now(),
    chaptersWhenAdded: null,
    latestKnownChapters: null,
    lastApiCheck: null,
    notificationsEnabled: false,
    anilistStatus: null,
    genres: [],
    tags: [],
    genresBackfilled: false,
    ...overrides,
  }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- --run src/shared/filterEngine.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement filter engine**

Create `src/shared/filterEngine.ts`:

```typescript
import type { TrackedItem, FilterEntry } from '@/shared/types'

export interface FilterCriteria {
  formats: string[]
  genres: FilterEntry[]
  tags: FilterEntry[]
}

/**
 * Apply tri-state filters to a list of tracked items.
 *
 * Logic:
 * - AND across categories (format AND genres AND tags)
 * - Within each category:
 *   - All AND-mode filters must match
 *   - At least one OR-mode filter must match (if any OR filters exist)
 *   - No Exclude-mode filter may match
 * - Format uses simple OR (item matches any selected format)
 */
export function applyFilters(items: TrackedItem[], criteria: FilterCriteria): TrackedItem[] {
  const hasFilters =
    criteria.formats.length > 0 || criteria.genres.length > 0 || criteria.tags.length > 0

  if (!hasFilters) return items

  return items.filter((item) => {
    // Format filter (OR logic)
    if (criteria.formats.length > 0) {
      if (!criteria.formats.includes(item.format)) return false
    }

    // Genre filter
    if (!matchesCategory(item.genres ?? [], criteria.genres)) return false

    // Tag filter
    if (!matchesCategory(item.tags ?? [], criteria.tags)) return false

    return true
  })
}

/**
 * Evaluate tri-state filter entries against a set of values.
 */
function matchesCategory(itemValues: string[], entries: FilterEntry[]): boolean {
  if (entries.length === 0) return true

  const andEntries = entries.filter((e) => e.mode === 'and')
  const orEntries = entries.filter((e) => e.mode === 'or')
  const excludeEntries = entries.filter((e) => e.mode === 'exclude')

  // All AND filters must match
  for (const entry of andEntries) {
    if (!itemValues.includes(entry.value)) return false
  }

  // At least one OR filter must match (if any OR filters exist)
  if (orEntries.length > 0) {
    const hasAnyOr = orEntries.some((entry) => itemValues.includes(entry.value))
    if (!hasAnyOr) return false
  }

  // No Exclude filter may match
  for (const entry of excludeEntries) {
    if (itemValues.includes(entry.value)) return false
  }

  return true
}

/**
 * Count active filters across all categories.
 */
export function countActiveFilters(criteria: FilterCriteria): number {
  return criteria.formats.length + criteria.genres.length + criteria.tags.length
}
```

- [ ] **Step 4: Run tests**

Run: `npm run test -- --run src/shared/filterEngine.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/filterEngine.ts src/shared/filterEngine.test.ts
git commit -m "feat: add pure filter engine with AND/OR/Exclude tri-state logic"
```

---

## Task 6: Background Message Handlers + Messaging Wrappers

**Files:**
- Modify: `src/background/index.ts`
- Modify: `src/sidepanel/services/messaging.ts`

- [ ] **Step 1: Add message handlers for tags and lists**

In `src/background/index.ts`, add new cases to the `handleMessage` switch (before the `default` case):

```typescript
    // Tag handlers
    case 'GET_CUSTOM_TAGS': {
      return storageService.getCustomTags()
    }

    case 'UPDATE_CUSTOM_TAGS': {
      await storageService.updateCustomTag(message.tagName, message.updates)
      return null
    }

    case 'DELETE_CUSTOM_TAG': {
      await storageService.deleteCustomTag(message.tagName)
      return null
    }

    // List handlers
    case 'GET_LISTS': {
      return storageService.getLists()
    }

    case 'CREATE_LIST': {
      return storageService.createList(message.list)
    }

    case 'UPDATE_LIST': {
      await storageService.updateList(message.listId, message.updates)
      return null
    }

    case 'DELETE_LIST': {
      await storageService.deleteList(message.listId)
      return null
    }
```

- [ ] **Step 2: Add messaging wrappers**

In `src/sidepanel/services/messaging.ts`, add imports for new types and add these functions:

```typescript
// -------------------------------------------------------------------------
// Tags
// -------------------------------------------------------------------------

export async function getCustomTags(): Promise<CustomTagRegistry> {
  return sendMessage<CustomTagRegistry>({ type: 'GET_CUSTOM_TAGS' })
}

export async function updateCustomTags(
  tagName: string,
  updates: { color?: string; newName?: string }
): Promise<void> {
  return sendMessage<void>({ type: 'UPDATE_CUSTOM_TAGS', tagName, updates })
}

export async function deleteCustomTag(tagName: string): Promise<void> {
  return sendMessage<void>({ type: 'DELETE_CUSTOM_TAG', tagName })
}

// -------------------------------------------------------------------------
// Lists
// -------------------------------------------------------------------------

export async function getLists(): Promise<CustomList[]> {
  return sendMessage<CustomList[]>({ type: 'GET_LISTS' })
}

export async function createList(
  list: Omit<CustomList, 'id' | 'createdAt' | 'updatedAt'>
): Promise<CustomList> {
  return sendMessage<CustomList>({ type: 'CREATE_LIST', list })
}

export async function updateList(
  listId: string,
  updates: Partial<CustomList>
): Promise<void> {
  return sendMessage<void>({ type: 'UPDATE_LIST', listId, updates })
}

export async function deleteList(listId: string): Promise<void> {
  return sendMessage<void>({ type: 'DELETE_LIST', listId })
}
```

Add the needed imports at the top of `messaging.ts`:
```typescript
import type { CustomTagRegistry, CustomList } from '@/shared/types'
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: Should pass for background/ and services/ files. Remaining errors may be in sidepanel components (not yet updated).

- [ ] **Step 4: Commit**

```bash
git add src/background/index.ts src/sidepanel/services/messaging.ts
git commit -m "feat: add message handlers and typed wrappers for tags and lists"
```

---

## Task 7: Fix Existing Code for New Required Fields

**Files:**
- Modify: `src/sidepanel/hooks/useAddItem.ts`
- Modify: `src/sidepanel/components/SearchModal.tsx`
- Modify: `src/storage/storageService.test.ts`
- Modify: `src/storage/storageService.ts` (exportData)

This task ensures all existing code compiles with the new TrackedItem fields.

- [ ] **Step 1: Update useAddItem to include genres**

In `src/sidepanel/hooks/useAddItem.ts`, in the `selectResult` function where a `TrackedItem` is built from a `UnifiedSearchResult`, add:

```typescript
genres: result.genres ?? [],
tags: [],
genresBackfilled: true, // genres came from the search result
```

- [ ] **Step 2: Update storageService.exportData**

In `src/storage/storageService.ts`, update the `exportData` method's `ExportedItem` mapping to include the new fields:

```typescript
genres: item.genres ?? [],
tags: item.tags ?? [],
genresBackfilled: item.genresBackfilled ?? false,
```

Also add `customTags` and `customLists` to the returned `ExportedData`:

```typescript
const customTags = await readCustomTags()
const customLists = await readLists()

return {
  version: 1,
  exportedAt: Date.now(),
  source: 'checkpoint-extension',
  settings,
  items: exportedItems,
  customTags,
  customLists,
}
```

Update `importData` to handle new fields on imported items (default them if missing) and merge `customTags`/`customLists`:

After importing items, add:
```typescript
// Import custom tags (incoming wins on conflict)
if (data.customTags) {
  const existingTags = await readCustomTags()
  const mergedTags = { ...existingTags, ...data.customTags }
  await writeCustomTags(mergedTags)
}

// Import custom lists (add new by ID, skip existing)
if (data.customLists) {
  const existingLists = await readLists()
  const existingIds = new Set(existingLists.map((l) => l.id))
  const newLists = data.customLists.filter((l) => !existingIds.has(l.id))
  if (newLists.length > 0) {
    await writeLists([...existingLists, ...newLists])
  }
}
```

- [ ] **Step 3: Update all test fixtures**

In `src/storage/storageService.test.ts`, add `genres: [], tags: [], genresBackfilled: false` to every `TrackedItem` fixture (any `makeItem` helper or inline object).

In `src/background/searchService.test.ts`, add `genres: []` to `MangaDexMedia` and `AniListMedia` mock objects.

- [ ] **Step 4: Run full test suite**

Run: `npm run test -- --run`
Expected: All tests PASS.

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: PASS (or only warnings). All files should compile.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "fix: update all code and tests for new TrackedItem fields (genres, tags, genresBackfilled)"
```

---

## Task 8: GenreBadges Component + ItemCard Integration

**Files:**
- Create: `src/sidepanel/components/GenreBadges.tsx`
- Create: `src/sidepanel/components/GenreBadges.css`
- Modify: `src/sidepanel/components/ItemCard.tsx`
- Modify: `src/sidepanel/components/ItemCard.css`

- [ ] **Step 1: Create GenreBadges component**

Create `src/sidepanel/components/GenreBadges.tsx`:

```tsx
import './GenreBadges.css'

interface GenreBadgesProps {
  genres: string[]
  maxVisible?: number
}

export function GenreBadges({ genres, maxVisible = 3 }: GenreBadgesProps) {
  if (!genres || genres.length === 0) return null

  const visible = genres.slice(0, maxVisible)
  const remaining = genres.length - maxVisible

  return (
    <div className="genre-badges">
      {visible.map((genre) => (
        <span key={genre} className="genre-badges__pill">
          {genre}
        </span>
      ))}
      {remaining > 0 && (
        <span className="genre-badges__more">+{remaining}</span>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create GenreBadges.css**

Create `src/sidepanel/components/GenreBadges.css`:

```css
.genre-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}

.genre-badges__pill {
  font-family: var(--font-body);
  font-size: 10px;
  font-weight: 500;
  padding: 1px 6px;
  border-radius: 8px;
  background: var(--surface);
  border: 1px solid var(--surface-border);
  color: var(--text-secondary);
  white-space: nowrap;
}

.genre-badges__more {
  font-family: var(--font-body);
  font-size: 10px;
  color: var(--text-secondary);
  padding: 1px 4px;
}
```

- [ ] **Step 3: Add GenreBadges to ItemCard**

In `src/sidepanel/components/ItemCard.tsx`, import and render `GenreBadges` below the title:

```tsx
import { GenreBadges } from './GenreBadges'
```

Add after the title element in the card body:
```tsx
<GenreBadges genres={item.genres} />
```

- [ ] **Step 4: Verify visually**

Run: `npm run dev`
Load the extension in Chrome and verify genre badges appear on ItemCards.

- [ ] **Step 5: Commit**

```bash
git add src/sidepanel/components/GenreBadges.tsx src/sidepanel/components/GenreBadges.css src/sidepanel/components/ItemCard.tsx
git commit -m "feat: display genre badges on ItemCard"
```

---

## Task 9: Tag System UI (TagInput, TagColorPicker, EditModal Integration)

**Files:**
- Create: `src/sidepanel/components/TagInput.tsx` + `.css`
- Create: `src/sidepanel/components/TagColorPicker.tsx` + `.css`
- Create: `src/sidepanel/hooks/useCustomTags.ts`
- Modify: `src/sidepanel/components/EditModal.tsx`
- Modify: `src/sidepanel/components/EditModal.css`

- [ ] **Step 1: Create useCustomTags hook**

Create `src/sidepanel/hooks/useCustomTags.ts`:

```typescript
import { useState, useEffect, useCallback } from 'react'
import { getCustomTags, updateCustomTags, deleteCustomTag as deleteTagMsg } from '../services/messaging'
import { TAG_COLORS } from '@/shared/constants'
import type { CustomTagRegistry } from '@/shared/types'

export function useCustomTags() {
  const [tags, setTags] = useState<CustomTagRegistry>({})

  const refresh = useCallback(async () => {
    const result = await getCustomTags()
    setTags(result)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const getNextColor = useCallback((): string => {
    const usedCount = Object.keys(tags).length
    return TAG_COLORS[usedCount % TAG_COLORS.length]
  }, [tags])

  const updateTag = useCallback(async (name: string, updates: { color?: string; newName?: string }) => {
    await updateCustomTags(name, updates)
    await refresh()
  }, [refresh])

  const deleteTag = useCallback(async (name: string) => {
    await deleteTagMsg(name)
    await refresh()
  }, [refresh])

  return { tags, refresh, getNextColor, updateTag, deleteTag }
}
```

- [ ] **Step 2: Create TagColorPicker component**

Create `src/sidepanel/components/TagColorPicker.tsx`:

```tsx
import { TAG_COLORS } from '@/shared/constants'
import './TagColorPicker.css'

interface TagColorPickerProps {
  currentColor: string
  onSelect: (color: string) => void
  onClose: () => void
}

export function TagColorPicker({ currentColor, onSelect, onClose }: TagColorPickerProps) {
  return (
    <div className="color-picker" onClick={(e) => e.stopPropagation()}>
      <div className="color-picker__grid">
        {TAG_COLORS.map((color) => (
          <button
            key={color}
            className={`color-picker__swatch ${color === currentColor ? 'color-picker__swatch--active' : ''}`}
            style={{ backgroundColor: color }}
            onClick={() => {
              onSelect(color)
              onClose()
            }}
          />
        ))}
      </div>
    </div>
  )
}
```

Create `src/sidepanel/components/TagColorPicker.css`:

```css
.color-picker {
  position: absolute;
  z-index: 10;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.color-picker__grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}

.color-picker__swatch {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  transition: transform 0.1s;
}

.color-picker__swatch:hover {
  transform: scale(1.2);
}

.color-picker__swatch--active {
  border-color: var(--text-primary);
}
```

- [ ] **Step 3: Create TagInput component**

Create `src/sidepanel/components/TagInput.tsx`:

```tsx
import { useState, useRef } from 'react'
import { TagColorPicker } from './TagColorPicker'
import type { CustomTagRegistry } from '@/shared/types'
import './TagInput.css'

interface TagInputProps {
  itemTags: string[]
  tagRegistry: CustomTagRegistry
  onAddTag: (name: string, color: string) => void
  onRemoveTag: (name: string) => void
  onUpdateTagColor: (name: string, color: string) => void
  getNextColor: () => string
}

export function TagInput({
  itemTags,
  tagRegistry,
  onAddTag,
  onRemoveTag,
  onUpdateTagColor,
  getNextColor,
}: TagInputProps) {
  const [input, setInput] = useState('')
  const [colorPickerTag, setColorPickerTag] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const suggestions = Object.keys(tagRegistry)
    .filter((name) => !itemTags.includes(name))
    .filter((name) => name.toLowerCase().includes(input.toLowerCase()))

  const showCreate = input.trim() && !tagRegistry[input.trim()]

  const handleAdd = (name: string) => {
    const color = tagRegistry[name]?.color ?? getNextColor()
    onAddTag(name, color)
    setInput('')
    inputRef.current?.focus()
  }

  return (
    <div className="tag-input">
      <div className="tag-input__pills">
        {itemTags.map((tag) => (
          <span
            key={tag}
            className="tag-input__pill"
            style={{ borderColor: tagRegistry[tag]?.color ?? '#666' }}
          >
            <span
              className="tag-input__dot"
              style={{ backgroundColor: tagRegistry[tag]?.color ?? '#666' }}
              onClick={() => setColorPickerTag(colorPickerTag === tag ? null : tag)}
            />
            {tag}
            <button className="tag-input__remove" onClick={() => onRemoveTag(tag)}>×</button>
            {colorPickerTag === tag && (
              <TagColorPicker
                currentColor={tagRegistry[tag]?.color ?? '#666'}
                onSelect={(color) => onUpdateTagColor(tag, color)}
                onClose={() => setColorPickerTag(null)}
              />
            )}
          </span>
        ))}
      </div>
      <input
        ref={inputRef}
        className="tag-input__field"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && input.trim()) {
            e.preventDefault()
            handleAdd(input.trim())
          }
        }}
        placeholder="Add tag..."
      />
      {input && (suggestions.length > 0 || showCreate) && (
        <div className="tag-input__dropdown">
          {suggestions.slice(0, 5).map((name) => (
            <button key={name} className="tag-input__option" onClick={() => handleAdd(name)}>
              <span className="tag-input__dot" style={{ backgroundColor: tagRegistry[name].color }} />
              {name}
            </button>
          ))}
          {showCreate && (
            <button className="tag-input__option tag-input__option--create" onClick={() => handleAdd(input.trim())}>
              Create "{input.trim()}"
            </button>
          )}
        </div>
      )}
    </div>
  )
}
```

Create `src/sidepanel/components/TagInput.css`:

```css
.tag-input {
  position: relative;
}

.tag-input__pills {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 6px;
}

.tag-input__pill {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 12px;
  background: var(--surface);
  border: 1px solid;
  color: var(--text-primary);
}

.tag-input__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  cursor: pointer;
  flex-shrink: 0;
}

.tag-input__remove {
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 14px;
  padding: 0 2px;
  line-height: 1;
}

.tag-input__remove:hover {
  color: var(--accent);
}

.tag-input__field {
  width: 100%;
  padding: 6px 10px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 13px;
  font-family: var(--font-body);
}

.tag-input__field:focus {
  outline: none;
  border-color: var(--accent);
}

.tag-input__dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 10;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 6px;
  margin-top: 4px;
  max-height: 150px;
  overflow-y: auto;
}

.tag-input__option {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  background: none;
  border: none;
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
  text-align: left;
}

.tag-input__option:hover {
  background: var(--surface-hover);
}

.tag-input__option--create {
  color: var(--accent);
  font-style: italic;
}
```

- [ ] **Step 4: Integrate TagInput into EditModal**

In `src/sidepanel/components/EditModal.tsx`:

Import: `import { TagInput } from './TagInput'`

Add `useCustomTags` hook usage and a tags section to the edit form (after the alt names section). The EditModal needs to:
1. Track local `editedTags` state initialized from `item.tags`
2. On save, include `tags` in the updates sent to `updateItem`
3. Pass tag CRUD callbacks to `TagInput`

- [ ] **Step 5: Verify visually**

Run: `npm run dev`
Load extension, open EditModal for an item. Verify tag input with autocomplete, color dots, and color picker work.

- [ ] **Step 6: Commit**

```bash
git add src/sidepanel/components/TagInput.tsx src/sidepanel/components/TagInput.css src/sidepanel/components/TagColorPicker.tsx src/sidepanel/components/TagColorPicker.css src/sidepanel/hooks/useCustomTags.ts src/sidepanel/components/EditModal.tsx src/sidepanel/components/EditModal.css
git commit -m "feat: add tag input with autocomplete and color picker to EditModal"
```

---

## Task 10: Manage Tags in SettingsPage

**Files:**
- Modify: `src/sidepanel/components/SettingsPage.tsx`
- Modify: `src/sidepanel/components/SettingsPage.css`

- [ ] **Step 1: Add Manage Tags section to SettingsPage**

In `src/sidepanel/components/SettingsPage.tsx`, add a "Tags" section that shows all tags from the registry with:
- Each tag displayed as a colored pill
- Inline rename (click name to edit)
- Color change (click dot to open TagColorPicker)
- Delete button with confirmation
- Use the `useCustomTags` hook

- [ ] **Step 2: Style the manage tags section**

Add corresponding CSS for the tag management list in `SettingsPage.css`.

- [ ] **Step 3: Verify visually**

Run: `npm run dev`
Open settings, verify tag management works (rename, recolor, delete).

- [ ] **Step 4: Commit**

```bash
git add src/sidepanel/components/SettingsPage.tsx src/sidepanel/components/SettingsPage.css
git commit -m "feat: add Manage Tags section to SettingsPage"
```

---

## Task 11: Lists View + List Detail

**Files:**
- Create: `src/sidepanel/components/ListsView.tsx` + `.css`
- Create: `src/sidepanel/components/ListDetail.tsx` + `.css`
- Create: `src/sidepanel/components/ListItemPicker.tsx` + `.css`
- Create: `src/sidepanel/hooks/useCustomLists.ts`
- Modify: `src/sidepanel/App.tsx`
- Modify: `src/sidepanel/components/Header.tsx`
- Modify: `src/sidepanel/components/Header.css`
- Modify: `src/sidepanel/components/EditModal.tsx`

- [ ] **Step 1: Create useCustomLists hook**

Create `src/sidepanel/hooks/useCustomLists.ts`:

```typescript
import { useState, useEffect, useCallback } from 'react'
import { getLists, createList, updateList, deleteList } from '../services/messaging'
import { DEFAULT_LIST_NAMES } from '@/shared/constants'
import type { CustomList } from '@/shared/types'

export function useCustomLists() {
  const [lists, setLists] = useState<CustomList[]>([])

  const refresh = useCallback(async () => {
    let result = await getLists()

    // Create default lists on first access
    if (result.length === 0) {
      for (const name of DEFAULT_LIST_NAMES) {
        await createList({ name, type: 'manual', itemIds: [], filters: null })
      }
      result = await getLists()
    }

    setLists(result)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  return {
    lists,
    refresh,
    createList: async (input: Omit<CustomList, 'id' | 'createdAt' | 'updatedAt'>) => {
      await createList(input)
      await refresh()
    },
    updateList: async (id: string, updates: Partial<CustomList>) => {
      await updateList(id, updates)
      await refresh()
    },
    deleteList: async (id: string) => {
      await deleteList(id)
      await refresh()
    },
  }
}
```

- [ ] **Step 2: Create ListItemPicker component**

Create `src/sidepanel/components/ListItemPicker.tsx` — a modal with checkboxes for all tracked items. Props: `allItems`, `selectedIds`, `onSave(ids)`, `onClose`. Style in `ListItemPicker.css`.

- [ ] **Step 3: Create ListsView component**

Create `src/sidepanel/components/ListsView.tsx` — shows all lists with name, item count, type icon, edit/delete buttons, and "New List" button. Uses `useCustomLists`. When a list is tapped, it calls a `onOpenList(list)` callback. Style in `ListsView.css`.

- [ ] **Step 4: Create ListDetail component**

Create `src/sidepanel/components/ListDetail.tsx` — shows items in a single list using `ItemCard`. For manual lists: "Add Items" button opens `ListItemPicker`. For smart lists: "Edit Filters" button (implemented in Task 12). Back button. Remove-from-list button on each card (manual only). Style in `ListDetail.css`.

- [ ] **Step 5: Add lists view mode to App.tsx**

In `src/sidepanel/App.tsx`:
- Add `'lists'` to the view type: `type View = 'list' | 'settings' | 'lists'`
- Add state for `selectedList: CustomList | null`
- When `view === 'lists'` and no selectedList, render `<ListsView />`
- When `view === 'lists'` and selectedList, render `<ListDetail />`

- [ ] **Step 6: Add lists icon to Header**

In `src/sidepanel/components/Header.tsx`, add a lists icon button next to the settings button. On click, it calls `onListsClick()` (passed from App.tsx).

- [ ] **Step 7: Add list membership to EditModal**

In `src/sidepanel/components/EditModal.tsx`, add a section showing which manual lists the item belongs to, with toggle checkboxes. Uses `useCustomLists` to get available lists and updates membership.

- [ ] **Step 8: Verify visually**

Run: `npm run dev`
- Default lists appear on first open
- Create/rename/delete lists
- Add items to lists via ListItemPicker
- Navigate into a list and back
- Toggle list membership from EditModal

- [ ] **Step 9: Commit**

```bash
git add src/sidepanel/components/ListsView.tsx src/sidepanel/components/ListsView.css src/sidepanel/components/ListDetail.tsx src/sidepanel/components/ListDetail.css src/sidepanel/components/ListItemPicker.tsx src/sidepanel/components/ListItemPicker.css src/sidepanel/hooks/useCustomLists.ts src/sidepanel/App.tsx src/sidepanel/components/Header.tsx src/sidepanel/components/Header.css src/sidepanel/components/EditModal.tsx src/sidepanel/components/EditModal.css
git commit -m "feat: add custom lists view with manual list management"
```

---

## Task 12: Filter Panel + FilterChip + Save as List

**Files:**
- Create: `src/sidepanel/components/FilterPanel.tsx` + `.css`
- Create: `src/sidepanel/components/FilterChip.tsx` + `.css`
- Create: `src/sidepanel/hooks/useFilterPanel.ts`
- Modify: `src/sidepanel/App.tsx`
- Modify: `src/sidepanel/components/SearchBar.tsx` (add filter toggle button)
- Modify: `src/sidepanel/components/SearchBar.css`

- [ ] **Step 1: Create useFilterPanel hook**

Create `src/sidepanel/hooks/useFilterPanel.ts`:

```typescript
import { useState, useMemo, useCallback } from 'react'
import { applyFilters, countActiveFilters } from '@/shared/filterEngine'
import type { TrackedItem, FilterEntry } from '@/shared/types'

export interface FilterState {
  formats: string[]
  genres: FilterEntry[]
  tags: FilterEntry[]
}

const EMPTY_FILTERS: FilterState = { formats: [], genres: [], tags: [] }

export function useFilterPanel(items: TrackedItem[], activeTab: string) {
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS)
  const [isOpen, setIsOpen] = useState(false)

  // Collect all unique genres and tags from items for picker
  const availableGenres = useMemo(() => {
    const set = new Set<string>()
    items.forEach((item) => (item.genres ?? []).forEach((g) => set.add(g)))
    return Array.from(set).sort()
  }, [items])

  const availableTags = useMemo(() => {
    const set = new Set<string>()
    items.forEach((item) => (item.tags ?? []).forEach((t) => set.add(t)))
    return Array.from(set).sort()
  }, [items])

  // Combine tab filter with panel filters
  const effectiveFilters = useMemo((): FilterState => {
    const formats = activeTab !== 'ALL' ? [activeTab] : filters.formats
    return { formats, genres: filters.genres, tags: filters.tags }
  }, [activeTab, filters])

  const filteredItems = useMemo(
    () => applyFilters(items, effectiveFilters),
    [items, effectiveFilters]
  )

  const activeFilterCount = countActiveFilters(filters)

  const toggleGenre = useCallback((value: string) => {
    setFilters((prev) => {
      const existing = prev.genres.find((e) => e.value === value)
      if (!existing) {
        return { ...prev, genres: [...prev.genres, { value, mode: 'and' }] }
      }
      // Cycle: and → or → exclude → remove
      if (existing.mode === 'and') {
        return { ...prev, genres: prev.genres.map((e) => e.value === value ? { ...e, mode: 'or' } : e) }
      }
      if (existing.mode === 'or') {
        return { ...prev, genres: prev.genres.map((e) => e.value === value ? { ...e, mode: 'exclude' } : e) }
      }
      // exclude → remove
      return { ...prev, genres: prev.genres.filter((e) => e.value !== value) }
    })
  }, [])

  const toggleTag = useCallback((value: string) => {
    setFilters((prev) => {
      const existing = prev.tags.find((e) => e.value === value)
      if (!existing) {
        return { ...prev, tags: [...prev.tags, { value, mode: 'and' }] }
      }
      if (existing.mode === 'and') {
        return { ...prev, tags: prev.tags.map((e) => e.value === value ? { ...e, mode: 'or' } : e) }
      }
      if (existing.mode === 'or') {
        return { ...prev, tags: prev.tags.map((e) => e.value === value ? { ...e, mode: 'exclude' } : e) }
      }
      return { ...prev, tags: prev.tags.filter((e) => e.value !== value) }
    })
  }, [])

  const clearFilters = useCallback(() => setFilters(EMPTY_FILTERS), [])

  const getSmartListFilters = useCallback(() => effectiveFilters, [effectiveFilters])

  return {
    filters,
    isOpen,
    setIsOpen,
    filteredItems,
    activeFilterCount,
    availableGenres,
    availableTags,
    toggleGenre,
    toggleTag,
    clearFilters,
    getSmartListFilters,
  }
}
```

- [ ] **Step 2: Create FilterChip component**

Create `src/sidepanel/components/FilterChip.tsx`:

```tsx
import type { FilterEntry } from '@/shared/types'
import './FilterChip.css'

interface FilterChipProps {
  entry: FilterEntry
  color?: string  // for tags
  onClick: () => void
}

const MODE_ICONS = { and: '✓', or: '·', exclude: '✕' }
const MODE_CLASSES = { and: 'filter-chip--and', or: 'filter-chip--or', exclude: 'filter-chip--exclude' }

export function FilterChip({ entry, color, onClick }: FilterChipProps) {
  return (
    <button className={`filter-chip ${MODE_CLASSES[entry.mode]}`} onClick={onClick}>
      <span className="filter-chip__icon">{MODE_ICONS[entry.mode]}</span>
      {color && <span className="filter-chip__dot" style={{ backgroundColor: color }} />}
      <span className={entry.mode === 'exclude' ? 'filter-chip__label--strike' : ''}>
        {entry.value}
      </span>
    </button>
  )
}
```

Create `src/sidepanel/components/FilterChip.css`:

```css
.filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border-radius: 14px;
  font-size: 12px;
  font-family: var(--font-body);
  cursor: pointer;
  border: 1px solid;
  background: var(--surface);
  color: var(--text-primary);
  transition: all 0.15s;
}

.filter-chip--and {
  border-color: var(--progress);
}

.filter-chip--or {
  border-color: #3b82f6;
}

.filter-chip--exclude {
  border-color: var(--accent);
}

.filter-chip__icon {
  font-weight: 700;
  font-size: 11px;
}

.filter-chip--and .filter-chip__icon { color: var(--progress); }
.filter-chip--or .filter-chip__icon { color: #3b82f6; }
.filter-chip--exclude .filter-chip__icon { color: var(--accent); }

.filter-chip__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.filter-chip__label--strike {
  text-decoration: line-through;
}

.filter-chip:hover {
  background: var(--surface-hover);
}
```

- [ ] **Step 3: Create FilterPanel component**

Create `src/sidepanel/components/FilterPanel.tsx` — collapsible panel with:
- Genres section: shows all `availableGenres` as clickable chips (not yet selected → plain, selected → `FilterChip`)
- Tags section: same pattern with tag colors from registry
- Active filters summary above results
- "Clear all" button
- "Save as List" button at bottom when filters are active
- Style in `FilterPanel.css`

- [ ] **Step 4: Integrate filter panel into App.tsx**

In `src/sidepanel/App.tsx`:
- Use `useFilterPanel` hook
- Pass `filteredItems` to `ItemList` instead of the current filtered array
- Add filter toggle button next to `SearchBar` with badge showing `activeFilterCount`
- Render `FilterPanel` between search bar and item list when `isOpen`
- Wire "Save as List" to create a smart list via `useCustomLists`

- [ ] **Step 5: Add filter toggle to SearchBar area**

Modify `src/sidepanel/components/SearchBar.tsx` (or the area in App.tsx around SearchBar) to include a filter icon button with active filter count badge.

- [ ] **Step 6: Verify visually**

Run: `npm run dev`
- Toggle filter panel open/close
- Click genre chips to cycle through ✓/·/✕ states
- Verify AND/OR/Exclude logic filters items correctly
- Verify "Save as List" creates a smart list
- Open the smart list and verify "Edit Filters" works

- [ ] **Step 7: Commit**

```bash
git add src/sidepanel/components/FilterPanel.tsx src/sidepanel/components/FilterPanel.css src/sidepanel/components/FilterChip.tsx src/sidepanel/components/FilterChip.css src/sidepanel/hooks/useFilterPanel.ts src/sidepanel/App.tsx src/sidepanel/components/SearchBar.tsx src/sidepanel/components/SearchBar.css
git commit -m "feat: add collapsible filter panel with tri-state genre/tag filtering and save-as-list"
```

---

## Task 13: Backfill Progress Indicator

**Files:**
- Create: `src/sidepanel/components/BackfillIndicator.tsx` + `.css`
- Create: `src/sidepanel/hooks/useBackfillProgress.ts`
- Modify: `src/sidepanel/App.tsx`

- [ ] **Step 1: Create useBackfillProgress hook**

Create `src/sidepanel/hooks/useBackfillProgress.ts`:

```typescript
import { useState, useEffect } from 'react'
import type { BackfillProgress } from '@/shared/types'
import { BACKFILL_PROGRESS_KEY } from '@/shared/constants'

export function useBackfillProgress() {
  const [progress, setProgress] = useState<BackfillProgress | null>(null)

  useEffect(() => {
    // Read initial state
    chrome.storage.local.get(BACKFILL_PROGRESS_KEY, (result) => {
      const p = result[BACKFILL_PROGRESS_KEY] as BackfillProgress | undefined
      if (p && p.status !== 'done') setProgress(p)
    })

    // Listen for changes
    const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes[BACKFILL_PROGRESS_KEY]) {
        const newVal = changes[BACKFILL_PROGRESS_KEY].newValue as BackfillProgress | null
        if (newVal?.status === 'done') {
          setProgress(null)
          // Clean up the storage key
          chrome.storage.local.remove(BACKFILL_PROGRESS_KEY)
        } else {
          setProgress(newVal ?? null)
        }
      }
    }

    chrome.storage.onChanged.addListener(listener)
    return () => chrome.storage.onChanged.removeListener(listener)
  }, [])

  return progress
}
```

- [ ] **Step 2: Create BackfillIndicator component**

Create `src/sidepanel/components/BackfillIndicator.tsx`:

```tsx
import type { BackfillProgress } from '@/shared/types'
import './BackfillIndicator.css'

interface BackfillIndicatorProps {
  progress: BackfillProgress
}

export function BackfillIndicator({ progress }: BackfillIndicatorProps) {
  const pct = Math.round((progress.completed / progress.total) * 100)

  return (
    <div className="backfill-indicator">
      <span className="backfill-indicator__text">
        Updating metadata... {progress.completed}/{progress.total}
      </span>
      <div className="backfill-indicator__bar">
        <div className="backfill-indicator__fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
```

Create `src/sidepanel/components/BackfillIndicator.css`:

```css
.backfill-indicator {
  padding: 6px 12px;
  background: var(--surface);
  border-bottom: 1px solid var(--surface-border);
}

.backfill-indicator__text {
  font-family: var(--font-body);
  font-size: 11px;
  color: var(--text-secondary);
}

.backfill-indicator__bar {
  margin-top: 4px;
  height: 3px;
  background: var(--bg-primary);
  border-radius: 2px;
  overflow: hidden;
}

.backfill-indicator__fill {
  height: 100%;
  background: var(--progress);
  border-radius: 2px;
  transition: width 0.3s ease;
}
```

- [ ] **Step 3: Integrate into App.tsx**

In `src/sidepanel/App.tsx`, use `useBackfillProgress` and render `BackfillIndicator` at the top of the list view when progress is non-null.

- [ ] **Step 4: Verify visually**

To test: temporarily add items without `genresBackfilled: true` to storage, reload extension, and verify the progress bar appears and updates.

- [ ] **Step 5: Commit**

```bash
git add src/sidepanel/components/BackfillIndicator.tsx src/sidepanel/components/BackfillIndicator.css src/sidepanel/hooks/useBackfillProgress.ts src/sidepanel/App.tsx
git commit -m "feat: add non-blocking backfill progress indicator"
```

---

## Task 14: Final Integration, Typecheck, and Full Test Pass

**Files:**
- All modified files

- [ ] **Step 1: Run full typecheck**

Run: `npm run typecheck`
Expected: PASS — zero errors.

- [ ] **Step 2: Run full test suite**

Run: `npm run test -- --run`
Expected: All tests PASS.

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: PASS — no lint errors.

- [ ] **Step 4: Build production**

Run: `npm run build`
Expected: Successful production build with no errors.

- [ ] **Step 5: Manual smoke test**

Load `dist/` as unpacked extension:
1. Add a new title — verify genres populate on the card
2. Open EditModal — verify tag input works (add, remove, autocomplete, color picker)
3. Open Settings — verify Manage Tags section
4. Open Lists view — verify default lists created
5. Create a manual list, add items to it
6. Open filter panel — verify genre/tag chips with ✓/·/✕ cycling
7. Apply filters — verify items filter correctly
8. Save filters as smart list — verify smart list shows correct items
9. Export data — verify customTags and customLists included
10. Import data on fresh install — verify everything restores

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat: complete genres, tags, lists, and filtering integration"
```

---

## Task 15: Version Bump

**Files:**
- Modify: `package.json`
- Modify: `public/manifest.json`

- [ ] **Step 1: Bump version**

Update version to `0.5.0` in both `package.json` and `public/manifest.json`.

- [ ] **Step 2: Commit**

```bash
git add package.json public/manifest.json
git commit -m "chore: bump version to 0.5.0"
```
