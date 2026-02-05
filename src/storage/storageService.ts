import { TrackedItem } from '@/shared/types'

const STORAGE_KEY = 'trackedItems'

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
}
