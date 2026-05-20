import type { TrackedItem, ExtensionSettings, ExportedData, ExportedItem, ImportResult, CustomTagRegistry, CustomList, BackfillProgress } from '@/shared/types'
import { DEFAULT_SETTINGS } from '@/shared/types'
import { createLogger } from '@/shared/logger'

const log = createLogger('storage')

const STORAGE_KEY = 'trackedItems'
const SETTINGS_KEY = 'settings'
const CUSTOM_TAGS_KEY = 'customTags'
const CUSTOM_LISTS_KEY = 'customLists'
const BACKFILL_PROGRESS_KEY = 'backfillProgress'
const LAST_SAVE_ATTEMPT_KEY = 'lastSaveAttempt'

function writeLastSaveAttempt(attempt: {
  providerId: string
  provider: string
  ok: boolean
  ts: number
}): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [LAST_SAVE_ATTEMPT_KEY]: attempt }, () => resolve())
  })
}

/**
 * Simple serialization queue to prevent concurrent read-modify-write races.
 * All storage mutations are funnelled through this so that only one
 * read→modify→write cycle runs at a time.
 */
let mutationQueue = Promise.resolve()

function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const op = mutationQueue.then(fn, fn)
  mutationQueue = op.then(() => {}, () => {})
  return op
}

/**
 * Reads the raw array of TrackedItems out of chrome.storage.local.
 * Returns an empty array when the key has never been written.
 */
function readAll(): Promise<TrackedItem[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      resolve((result[STORAGE_KEY] as TrackedItem[]) ?? [])
    })
  })
}

/**
 * Overwrites the full array in chrome.storage.local.
 */
function writeAll(items: TrackedItem[]): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: items }, resolve)
  })
}

/**
 * Reads settings from chrome.storage.local.
 * Returns default settings when the key has never been written.
 */
function readSettings(): Promise<ExtensionSettings> {
  return new Promise((resolve) => {
    chrome.storage.local.get(SETTINGS_KEY, (result) => {
      resolve((result[SETTINGS_KEY] as ExtensionSettings) ?? { ...DEFAULT_SETTINGS })
    })
  })
}

/**
 * Writes settings to chrome.storage.local.
 */
function writeSettings(settings: ExtensionSettings): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [SETTINGS_KEY]: settings }, resolve)
  })
}

/**
 * Reads the custom tag registry from chrome.storage.local.
 * Returns an empty object when the key has never been written.
 */
function readCustomTags(): Promise<CustomTagRegistry> {
  return new Promise((resolve) => {
    chrome.storage.local.get(CUSTOM_TAGS_KEY, (result) => {
      resolve((result[CUSTOM_TAGS_KEY] as CustomTagRegistry) ?? {})
    })
  })
}

/**
 * Overwrites the custom tag registry in chrome.storage.local.
 */
function writeCustomTags(tags: CustomTagRegistry): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [CUSTOM_TAGS_KEY]: tags }, resolve)
  })
}

/**
 * Reads the custom lists array from chrome.storage.local.
 * Returns an empty array when the key has never been written.
 */
function readLists(): Promise<CustomList[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get(CUSTOM_LISTS_KEY, (result) => {
      resolve((result[CUSTOM_LISTS_KEY] as CustomList[]) ?? [])
    })
  })
}

/**
 * Overwrites the custom lists array in chrome.storage.local.
 */
function writeLists(lists: CustomList[]): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [CUSTOM_LISTS_KEY]: lists }, resolve)
  })
}

export class StorageService {
  /**
   * Return all tracked items, optionally filtered to a single format.
   * Results are sorted by updatedAt descending (newest first).
   */
  async getAll(format?: 'MANGA' | 'MANHWA' | 'MANHUA'): Promise<TrackedItem[]> {
    const items = await readAll()

    const filtered = format ? items.filter((item) => item.format === format) : items

    return filtered.sort((a, b) => b.updatedAt - a.updatedAt)
  }

  /**
   * Retrieve a single item by its AniList provider ID, or null if not found.
   */
  async getById(providerId: string): Promise<TrackedItem | null> {
    const items = await readAll()
    return items.find((item) => item.providerId === providerId) ?? null
  }

  /**
   * Persist a new item, or update progress if item already exists with higher chapter.
   */
  async save(item: TrackedItem): Promise<void> {
    return serialize(async () => {
      const items = await readAll()

      const existingIndex = items.findIndex((existing) => existing.providerId === item.providerId)
      const mode: 'update' | 'create' | 'noop' =
        existingIndex !== -1
          ? (parseFloat(item.progress.value) || 0) > (parseFloat(items[existingIndex].progress.value) || 0)
            ? 'update'
            : 'noop'
          : 'create'

      if (existingIndex !== -1) {
        const existing = items[existingIndex]
        const oldProgress = parseFloat(existing.progress.value) || 0
        const newProgress = parseFloat(item.progress.value) || 0

        if (newProgress > oldProgress) {
          items[existingIndex] = {
            ...existing,
            progress: item.progress,
            lastUrl: item.lastUrl,
            updatedAt: Date.now(),
            // Update notification baseline to current known chapters
            chaptersWhenAdded: existing.latestKnownChapters ?? existing.chaptersWhenAdded,
          }
          await writeAll(items)
        }
      } else {
        items.push(item)
        await writeAll(items)
      }

      // Read-back assertion: confirm the item is present after the write.
      const after = await readAll()
      const ok = after.some((i) => i.providerId === item.providerId)
      log.info('save', { providerId: item.providerId, mode, total: after.length, ok })
      if (!ok) {
        log.error('save read-back failed', { providerId: item.providerId, mode })
      }
      await writeLastSaveAttempt({
        providerId: item.providerId,
        provider: item.provider,
        ok,
        ts: Date.now(),
      })
    })
  }

  /**
   * Apply a partial update to an existing item identified by providerId.
   * The updatedAt timestamp is automatically set to the current time;
   * any updatedAt value supplied in the updates object is ignored.
   */
  async update(providerId: string, updates: Partial<TrackedItem>): Promise<void> {
    return serialize(async () => {
      const items = await readAll()

      const index = items.findIndex((item) => item.providerId === providerId)
      if (index === -1) return

      items[index] = {
        ...items[index],
        ...updates,
        providerId, // ensure providerId cannot be overwritten
        updatedAt: Date.now(),
      }

      await writeAll(items)
    })
  }

  /**
   * Remove an item by providerId.  No-ops when the ID does not exist.
   * Also removes the item from all manual lists' itemIds arrays.
   */
  async delete(providerId: string): Promise<void> {
    return serialize(async () => {
      const items = await readAll()
      await writeAll(items.filter((item) => item.providerId !== providerId))

      // Clean up from all manual lists
      const lists = await readLists()
      let listsChanged = false
      const updatedLists = lists.map((list) => {
        if (list.type !== 'manual') return list
        const idx = list.itemIds.indexOf(providerId)
        if (idx === -1) return list
        listsChanged = true
        return { ...list, itemIds: list.itemIds.filter((id) => id !== providerId) }
      })
      if (listsChanged) await writeLists(updatedLists)
    })
  }

  // -------------------------------------------------------------------------
  // Settings methods
  // -------------------------------------------------------------------------

  /**
   * Retrieve extension settings.
   */
  async getSettings(): Promise<ExtensionSettings> {
    return readSettings()
  }

  /**
   * Update extension settings (partial update supported).
   */
  async updateSettings(updates: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
    const current = await readSettings()
    const updated = { ...current, ...updates }
    await writeSettings(updated)
    return updated
  }

  // -------------------------------------------------------------------------
  // Bulk operations for chapter checking
  // -------------------------------------------------------------------------

  /**
   * Get all items that need chapter updates (RELEASING status, notifications enabled).
   */
  async getItemsForUpdate(): Promise<TrackedItem[]> {
    const items = await readAll()
    return items.filter(
      (item) =>
        item.notificationsEnabled &&
        item.anilistStatus !== 'FINISHED' &&
        item.anilistStatus !== 'CANCELLED'
    )
  }

  /**
   * Bulk update chapter info for multiple items.
   */
  async bulkUpdateChapterInfo(
    updates: Array<{
      providerId: string
      latestKnownChapters: number | null
      anilistStatus: string | null
      lastApiCheck: number
    }>
  ): Promise<void> {
    return serialize(async () => {
      const items = await readAll()

      for (const update of updates) {
        const index = items.findIndex((item) => item.providerId === update.providerId)
        if (index !== -1) {
          items[index] = {
            ...items[index],
            latestKnownChapters: update.latestKnownChapters,
            anilistStatus: update.anilistStatus,
            lastApiCheck: update.lastApiCheck,
          }
        }
      }

      await writeAll(items)
    })
  }

  // -------------------------------------------------------------------------
  // Custom Tag methods
  // -------------------------------------------------------------------------

  /**
   * Return the full custom tag registry.
   */
  async getCustomTags(): Promise<CustomTagRegistry> {
    return readCustomTags()
  }

  /**
   * Save (add or overwrite) a tag in the registry.
   */
  async saveCustomTag(name: string, color: string): Promise<void> {
    return serialize(async () => {
      const tags = await readCustomTags()
      tags[name] = { color }
      await writeCustomTags(tags)
    })
  }

  /**
   * Update a tag's color and/or rename it.
   * Rename cascades to all items' tags[] arrays and smart list filter entries.
   */
  async updateCustomTag(name: string, updates: { color?: string; newName?: string }): Promise<void> {
    return serialize(async () => {
      const tags = await readCustomTags()

      // Create tag if it doesn't exist yet (upsert)
      if (!(name in tags)) {
        if (updates.color) {
          tags[name] = { color: updates.color }
          await writeCustomTags(tags)
        }
        return
      }

      const existing = tags[name]
      const newColor = updates.color ?? existing.color
      const newName = updates.newName ?? name

      // Update registry
      delete tags[name]
      tags[newName] = { color: newColor }
      await writeCustomTags(tags)

      // If renaming, cascade to items and lists
      if (updates.newName && updates.newName !== name) {
        // Cascade to items
        const items = await readAll()
        const updatedItems = items.map((item) => {
          const idx = item.tags.indexOf(name)
          if (idx === -1) return item
          const newTags = [...item.tags]
          newTags[idx] = updates.newName!
          return { ...item, tags: newTags }
        })
        await writeAll(updatedItems)

        // Cascade to smart list filter entries
        const lists = await readLists()
        const updatedLists = lists.map((list) => {
          if (!list.filters) return list
          const newTagFilters = list.filters.tags.map((entry) =>
            entry.value === name ? { ...entry, value: updates.newName! } : entry
          )
          return { ...list, filters: { ...list.filters, tags: newTagFilters } }
        })
        await writeLists(updatedLists)
      }
    })
  }

  /**
   * Delete a tag from the registry, cascading to items and smart list filters.
   */
  async deleteCustomTag(name: string): Promise<void> {
    return serialize(async () => {
      const tags = await readCustomTags()
      if (!(name in tags)) return

      delete tags[name]
      await writeCustomTags(tags)

      // Cascade to items
      const items = await readAll()
      const updatedItems = items.map((item) => {
        if (!item.tags.includes(name)) return item
        return { ...item, tags: item.tags.filter((t) => t !== name) }
      })
      await writeAll(updatedItems)

      // Cascade to smart list filter entries
      const lists = await readLists()
      const updatedLists = lists.map((list) => {
        if (!list.filters) return list
        const newTagFilters = list.filters.tags.filter((entry) => entry.value !== name)
        return { ...list, filters: { ...list.filters, tags: newTagFilters } }
      })
      await writeLists(updatedLists)
    })
  }

  // -------------------------------------------------------------------------
  // Custom List methods
  // -------------------------------------------------------------------------

  /**
   * Return all custom lists.
   */
  async getLists(): Promise<CustomList[]> {
    return readLists()
  }

  /**
   * Create a new list with a generated id and timestamps.
   */
  async createList(input: Omit<CustomList, 'id' | 'createdAt' | 'updatedAt'>): Promise<CustomList> {
    return serialize(async () => {
      const lists = await readLists()
      const now = Date.now()
      const newList: CustomList = {
        ...input,
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
      }
      lists.push(newList)
      await writeLists(lists)
      return newList
    })
  }

  /**
   * Apply a partial update to an existing list.
   * Protects id from being overwritten; auto-sets updatedAt.
   */
  async updateList(listId: string, updates: Partial<CustomList>): Promise<void> {
    return serialize(async () => {
      const lists = await readLists()
      const index = lists.findIndex((l) => l.id === listId)
      if (index === -1) return

      lists[index] = {
        ...lists[index],
        ...updates,
        id: listId, // protect id from being overwritten
        updatedAt: Date.now(),
      }

      await writeLists(lists)
    })
  }

  /**
   * Delete a list by id.
   */
  async deleteList(listId: string): Promise<void> {
    return serialize(async () => {
      const lists = await readLists()
      await writeLists(lists.filter((l) => l.id !== listId))
    })
  }

  // -------------------------------------------------------------------------
  // Backfill progress methods
  // -------------------------------------------------------------------------

  /**
   * Write backfill progress directly (not serialized — direct write).
   */
  async writeBackfillProgress(progress: BackfillProgress): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [BACKFILL_PROGRESS_KEY]: progress }, resolve)
    })
  }

  /**
   * Read backfill progress from storage.
   */
  async getBackfillProgress(): Promise<BackfillProgress | null> {
    return new Promise((resolve) => {
      chrome.storage.local.get(BACKFILL_PROGRESS_KEY, (result) => {
        resolve((result[BACKFILL_PROGRESS_KEY] as BackfillProgress) ?? null)
      })
    })
  }

  // -------------------------------------------------------------------------
  // Export/Import
  // -------------------------------------------------------------------------

  /**
   * Export all data for backup/sync.
   */
  async exportData(): Promise<ExportedData> {
    const items = await readAll()
    const settings = await readSettings()
    const customTags = await readCustomTags()
    const customLists = await readLists()

    const exportedItems: ExportedItem[] = items.map((item) => ({
      provider: item.provider,
      providerId: item.providerId,
      mediaType: item.mediaType,
      format: item.format,
      titles: item.titles,
      coverImage: item.coverImage,
      progress: item.progress,
      lastUrl: item.lastUrl,
      updatedAt: item.updatedAt,
      createdAt: item.createdAt,
      chaptersWhenAdded: item.chaptersWhenAdded,
      latestKnownChapters: item.latestKnownChapters,
      notificationsEnabled: item.notificationsEnabled,
      anilistStatus: item.anilistStatus,
      genres: item.genres ?? [],
      tags: item.tags ?? [],
      genresBackfilled: item.genresBackfilled ?? false,
      comickHid: item.comickHid ?? null,
      comickSlug: item.comickSlug ?? null,
      anilistId: item.anilistId ?? null,
      pinned: item.pinned ?? false,
    }))

    return {
      version: 1,
      exportedAt: Date.now(),
      source: 'checkpoint-extension',
      settings,
      items: exportedItems,
      customTags,
      customLists,
    }
  }

  /**
   * Import data from backup/sync.
   * Merges with existing data using last-write-wins for conflicts.
   */
  async importData(data: ExportedData): Promise<ImportResult> {
    return serialize(async () => {
      const existingItems = await readAll()
      const existingMap = new Map(existingItems.map((item) => [item.providerId, item]))

      let imported = 0
      let updated = 0
      let skipped = 0
      const details = {
        importedTitles: [] as string[],
        updatedTitles: [] as string[],
        skippedTitles: [] as string[],
      }

      for (const importItem of data.items) {
        // Validate required fields
        if (
          !importItem.providerId ||
          !importItem.provider ||
          !importItem.titles?.main ||
          !importItem.progress?.value
        ) {
          skipped++
          details.skippedTitles.push(importItem.titles?.main ?? '(invalid item)')
          continue
        }

        const existing = existingMap.get(importItem.providerId)

        // Default new fields if not present in imported item
        const normalizedItem: TrackedItem = {
          ...importItem,
          genres: importItem.genres ?? [],
          tags: importItem.tags ?? [],
          genresBackfilled: importItem.genresBackfilled ?? false,
          lastApiCheck: null,
          comickHid: (importItem as TrackedItem).comickHid ?? null,
          comickSlug: (importItem as TrackedItem).comickSlug ?? null,
          anilistId: (importItem as TrackedItem).anilistId ?? null,
          pinned: (importItem as TrackedItem).pinned ?? false,
        }

        if (!existing) {
          // New item - add it
          existingMap.set(importItem.providerId, normalizedItem)
          details.importedTitles.push(importItem.titles.main)
          imported++
        } else if (importItem.updatedAt > existing.updatedAt) {
          // Imported item is newer - update
          existingMap.set(importItem.providerId, {
            ...normalizedItem,
            lastApiCheck: existing.lastApiCheck, // Preserve local API check time
          })
          details.updatedTitles.push(importItem.titles.main)
          updated++
        } else {
          details.skippedTitles.push(importItem.titles.main)
          skipped++
        }
      }

      await writeAll(Array.from(existingMap.values()))

      // Also import settings if they exist
      if (data.settings) {
        await writeSettings(data.settings)
      }

      // Merge customTags (incoming wins on conflict)
      if (data.customTags) {
        const existingTags = await readCustomTags()
        const mergedTags = { ...existingTags, ...data.customTags }
        await writeCustomTags(mergedTags)
      }

      // Merge customLists (add new by ID, skip existing)
      if (data.customLists && data.customLists.length > 0) {
        const existingLists = await readLists()
        const existingListIds = new Set(existingLists.map((l) => l.id))
        const newLists = data.customLists.filter((l) => !existingListIds.has(l.id))
        await writeLists([...existingLists, ...newLists])
      }

      return { imported, updated, skipped, details }
    })
  }
}
