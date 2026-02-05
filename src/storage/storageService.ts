import { TrackedItem, ExtensionSettings, DEFAULT_SETTINGS, ExportedData, ExportedItem } from '@/shared/types'

const STORAGE_KEY = 'trackedItems'
const SETTINGS_KEY = 'settings'

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
    const items = await readAll()

    const existingIndex = items.findIndex((existing) => existing.providerId === item.providerId)

    if (existingIndex !== -1) {
      // Update progress if new > old
      const existing = items[existingIndex]
      const oldProgress = parseFloat(existing.progress.value) || 0
      const newProgress = parseFloat(item.progress.value) || 0

      if (newProgress > oldProgress) {
        items[existingIndex] = {
          ...existing,
          progress: item.progress,
          lastUrl: item.lastUrl,
          updatedAt: Date.now(),
        }
        await writeAll(items)
      }
    } else {
      items.push(item)
      await writeAll(items)
    }
  }

  /**
   * Apply a partial update to an existing item identified by providerId.
   * The updatedAt timestamp is automatically set to the current time;
   * any updatedAt value supplied in the updates object is ignored.
   */
  async update(providerId: string, updates: Partial<TrackedItem>): Promise<void> {
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
  }

  /**
   * Remove an item by providerId.  No-ops when the ID does not exist.
   */
  async delete(providerId: string): Promise<void> {
    const items = await readAll()
    await writeAll(items.filter((item) => item.providerId !== providerId))
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
    }))

    return {
      version: 1,
      exportedAt: Date.now(),
      source: 'checkpoint-extension',
      settings,
      items: exportedItems,
    }
  }

  /**
   * Import data from backup/sync.
   * Merges with existing data using last-write-wins for conflicts.
   */
  async importData(data: ExportedData): Promise<{ imported: number; updated: number; skipped: number }> {
    const existingItems = await readAll()
    const existingMap = new Map(existingItems.map((item) => [item.providerId, item]))

    let imported = 0
    let updated = 0
    let skipped = 0

    for (const importItem of data.items) {
      const existing = existingMap.get(importItem.providerId)

      if (!existing) {
        // New item - add it
        const newItem: TrackedItem = {
          ...importItem,
          lastApiCheck: null,
        }
        existingMap.set(importItem.providerId, newItem)
        imported++
      } else if (importItem.updatedAt > existing.updatedAt) {
        // Imported item is newer - update
        existingMap.set(importItem.providerId, {
          ...existing,
          ...importItem,
          lastApiCheck: existing.lastApiCheck, // Preserve local API check time
        })
        updated++
      } else {
        skipped++
      }
    }

    await writeAll(Array.from(existingMap.values()))

    // Also import settings if they exist
    if (data.settings) {
      await writeSettings(data.settings)
    }

    return { imported, updated, skipped }
  }
}
