import { describe, it, expect, beforeEach } from 'vitest'
import { resetChromeStorage } from '@/__mocks__/chrome'
import { StorageService } from './storageService'
import type { TrackedItem, ExportedData, ExportedItem } from '@/shared/types'

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

let idCounter = 1

function makeItem(overrides: Partial<TrackedItem> = {}): TrackedItem {
  const id = String(idCounter++)
  return {
    provider: 'anilist',
    providerId: `item-${id}`,
    mediaType: 'manga',
    format: 'MANGA',
    titles: { main: `Title ${id}`, alt: [] },
    coverImage: '',
    progress: { unit: 'chapter', value: '1' },
    lastUrl: `https://example.com/${id}`,
    updatedAt: 1000,
    createdAt: 1000,
    chaptersWhenAdded: null,
    latestKnownChapters: null,
    lastApiCheck: null,
    notificationsEnabled: true,
    anilistStatus: 'RELEASING',
    genres: [],
    tags: [],
    genresBackfilled: false,
    pinned: false,
    ...overrides,
  }
}

function makeExportedItem(item: TrackedItem): ExportedItem {
  // ExportedItem is TrackedItem minus lastApiCheck
  const { lastApiCheck: __removed, ...rest } = item
  void __removed
  return rest
}

function makeExportedData(items: ExportedItem[]): ExportedData {
  return {
    version: 1,
    exportedAt: Date.now(),
    source: 'checkpoint-extension',
    settings: {
      globalNotificationsEnabled: true,
      notifyOnlyNewReleases: true,
      checkIntervalMinutes: 60,
      exportVersion: 1,
    },
    items,
    customTags: {},
    customLists: [],
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetChromeStorage()
  idCounter = 1
})

describe('StorageService', () => {
  const service = new StorageService()

  // -------------------------------------------------------------------------
  // save
  // -------------------------------------------------------------------------

  describe('save', () => {
    it('creates a new entry when providerId is not yet stored', async () => {
      const item = makeItem({ providerId: 'new-1', progress: { unit: 'chapter', value: '5' } })
      await service.save(item)

      const stored = await service.getById('new-1')
      expect(stored).not.toBeNull()
      expect(stored!.providerId).toBe('new-1')
      expect(stored!.progress.value).toBe('5')
    })

    it('upserts when incoming progress is higher than existing', async () => {
      const original = makeItem({ providerId: 'up-1', progress: { unit: 'chapter', value: '3' } })
      await service.save(original)

      const updated = makeItem({ providerId: 'up-1', progress: { unit: 'chapter', value: '7' } })
      await service.save(updated)

      const stored = await service.getById('up-1')
      expect(stored!.progress.value).toBe('7')
    })

    it('skips update when incoming progress is lower than existing', async () => {
      const original = makeItem({ providerId: 'skip-1', progress: { unit: 'chapter', value: '10' } })
      await service.save(original)

      const lower = makeItem({ providerId: 'skip-1', progress: { unit: 'chapter', value: '2' } })
      await service.save(lower)

      const stored = await service.getById('skip-1')
      expect(stored!.progress.value).toBe('10')
    })

    it('skips update when incoming progress equals existing', async () => {
      const original = makeItem({ providerId: 'eq-1', progress: { unit: 'chapter', value: '5' } })
      await service.save(original)

      const same = makeItem({ providerId: 'eq-1', progress: { unit: 'chapter', value: '5' } })
      await service.save(same)

      // updatedAt should not have changed from the original save — we can verify
      // indirectly by checking the value is still '5' and no error was thrown.
      const stored = await service.getById('eq-1')
      expect(stored!.progress.value).toBe('5')
    })

    it('updates chaptersWhenAdded to latestKnownChapters on upsert', async () => {
      const original = makeItem({
        providerId: 'cwa-1',
        progress: { unit: 'chapter', value: '3' },
        latestKnownChapters: 50,
        chaptersWhenAdded: 30,
      })
      await service.save(original)

      const updated = makeItem({ providerId: 'cwa-1', progress: { unit: 'chapter', value: '8' } })
      await service.save(updated)

      const stored = await service.getById('cwa-1')
      // chaptersWhenAdded should be set to the previous item's latestKnownChapters (50)
      expect(stored!.chaptersWhenAdded).toBe(50)
    })
  })

  describe('save read-back instrumentation', () => {
    it('writes a lastSaveAttempt with ok=true when save succeeds', async () => {
      const service = new StorageService()
      const item = makeItem({ providerId: 'p1' })
      await service.save(item)

      const lsa = await new Promise<unknown>((resolve) =>
        chrome.storage.local.get('lastSaveAttempt', (r) => resolve(r.lastSaveAttempt))
      )
      expect(lsa).toMatchObject({ providerId: 'p1', provider: item.provider, ok: true, mode: 'create' })
      expect((lsa as { ts: number }).ts).toBeGreaterThan(0)
    })
  })

  // -------------------------------------------------------------------------
  // update
  // -------------------------------------------------------------------------

  describe('update', () => {
    it('applies a partial update to an existing item', async () => {
      const item = makeItem({ providerId: 'upd-1', notificationsEnabled: true })
      await service.save(item)

      await service.update('upd-1', { notificationsEnabled: false })

      const stored = await service.getById('upd-1')
      expect(stored!.notificationsEnabled).toBe(false)
      // Other fields should be preserved
      expect(stored!.titles.main).toBe(item.titles.main)
    })

    it('does not overwrite providerId', async () => {
      const item = makeItem({ providerId: 'pid-guard' })
      await service.save(item)

      // Attempt to change the providerId via update
      await service.update('pid-guard', { providerId: 'hacked' } as Partial<TrackedItem>)

      const stored = await service.getById('pid-guard')
      expect(stored).not.toBeNull()
      expect(stored!.providerId).toBe('pid-guard')
    })

    it('is a no-op for a non-existent providerId', async () => {
      const item = makeItem({ providerId: 'real-1' })
      await service.save(item)

      // This should not throw
      await service.update('ghost-id', { notificationsEnabled: false })

      const all = await service.getAll()
      expect(all).toHaveLength(1)
    })
  })

  // -------------------------------------------------------------------------
  // delete
  // -------------------------------------------------------------------------

  describe('delete', () => {
    it('removes an item by providerId', async () => {
      const item = makeItem({ providerId: 'del-1' })
      await service.save(item)

      await service.delete('del-1')

      const stored = await service.getById('del-1')
      expect(stored).toBeNull()
    })

    it('is a no-op when the providerId does not exist', async () => {
      const item = makeItem({ providerId: 'keep-1' })
      await service.save(item)

      await service.delete('does-not-exist')

      const all = await service.getAll()
      expect(all).toHaveLength(1)
    })

    it('removes only the targeted item when multiple exist', async () => {
      await service.save(makeItem({ providerId: 'a' }))
      await service.save(makeItem({ providerId: 'b' }))
      await service.save(makeItem({ providerId: 'c' }))

      await service.delete('b')

      const all = await service.getAll()
      expect(all).toHaveLength(2)
      expect(all.find((i) => i.providerId === 'b')).toBeUndefined()
    })
  })

  // -------------------------------------------------------------------------
  // getItemsForUpdate
  // -------------------------------------------------------------------------

  describe('getItemsForUpdate', () => {
    it('includes items with RELEASING status and notifications enabled', async () => {
      const item = makeItem({ providerId: 'r-1', anilistStatus: 'RELEASING', notificationsEnabled: true })
      await service.save(item)

      const results = await service.getItemsForUpdate()
      expect(results.map((i) => i.providerId)).toContain('r-1')
    })

    it('includes items with null anilistStatus and notifications enabled', async () => {
      const item = makeItem({ providerId: 'null-status', anilistStatus: null, notificationsEnabled: true })
      await service.save(item)

      const results = await service.getItemsForUpdate()
      expect(results.map((i) => i.providerId)).toContain('null-status')
    })

    it('excludes items with FINISHED status', async () => {
      const item = makeItem({ providerId: 'fin-1', anilistStatus: 'FINISHED', notificationsEnabled: true })
      await service.save(item)

      const results = await service.getItemsForUpdate()
      expect(results.map((i) => i.providerId)).not.toContain('fin-1')
    })

    it('excludes items with CANCELLED status', async () => {
      const item = makeItem({ providerId: 'can-1', anilistStatus: 'CANCELLED', notificationsEnabled: true })
      await service.save(item)

      const results = await service.getItemsForUpdate()
      expect(results.map((i) => i.providerId)).not.toContain('can-1')
    })

    it('excludes items with notificationsEnabled=false', async () => {
      const item = makeItem({ providerId: 'nonotif-1', anilistStatus: 'RELEASING', notificationsEnabled: false })
      await service.save(item)

      const results = await service.getItemsForUpdate()
      expect(results.map((i) => i.providerId)).not.toContain('nonotif-1')
    })

    it('returns only qualifying items from a mixed set', async () => {
      await service.save(makeItem({ providerId: 'good', anilistStatus: 'RELEASING', notificationsEnabled: true }))
      await service.save(makeItem({ providerId: 'no-notif', anilistStatus: 'RELEASING', notificationsEnabled: false }))
      await service.save(makeItem({ providerId: 'finished', anilistStatus: 'FINISHED', notificationsEnabled: true }))
      await service.save(makeItem({ providerId: 'cancelled', anilistStatus: 'CANCELLED', notificationsEnabled: true }))

      const results = await service.getItemsForUpdate()
      const ids = results.map((i) => i.providerId)
      expect(ids).toContain('good')
      expect(ids).not.toContain('no-notif')
      expect(ids).not.toContain('finished')
      expect(ids).not.toContain('cancelled')
    })
  })

  // -------------------------------------------------------------------------
  // bulkUpdateChapterInfo
  // -------------------------------------------------------------------------

  describe('bulkUpdateChapterInfo', () => {
    it('updates latestKnownChapters, anilistStatus, and lastApiCheck', async () => {
      const item = makeItem({ providerId: 'bulk-1', latestKnownChapters: 10, anilistStatus: 'RELEASING', lastApiCheck: null })
      await service.save(item)

      const now = Date.now()
      await service.bulkUpdateChapterInfo([
        { providerId: 'bulk-1', latestKnownChapters: 25, anilistStatus: 'FINISHED', lastApiCheck: now },
      ])

      const stored = await service.getById('bulk-1')
      expect(stored!.latestKnownChapters).toBe(25)
      expect(stored!.anilistStatus).toBe('FINISHED')
      expect(stored!.lastApiCheck).toBe(now)
    })

    it('preserves all other fields after bulk update', async () => {
      const item = makeItem({
        providerId: 'bulk-2',
        titles: { main: 'Preserved Title', alt: ['Alt'] },
        progress: { unit: 'chapter', value: '5' },
        notificationsEnabled: false,
      })
      await service.save(item)

      await service.bulkUpdateChapterInfo([
        { providerId: 'bulk-2', latestKnownChapters: 100, anilistStatus: 'RELEASING', lastApiCheck: 9999 },
      ])

      const stored = await service.getById('bulk-2')
      expect(stored!.titles.main).toBe('Preserved Title')
      expect(stored!.progress.value).toBe('5')
      expect(stored!.notificationsEnabled).toBe(false)
    })

    it('handles multiple updates in one call', async () => {
      await service.save(makeItem({ providerId: 'multi-1', latestKnownChapters: 1 }))
      await service.save(makeItem({ providerId: 'multi-2', latestKnownChapters: 2 }))

      await service.bulkUpdateChapterInfo([
        { providerId: 'multi-1', latestKnownChapters: 50, anilistStatus: 'RELEASING', lastApiCheck: 1000 },
        { providerId: 'multi-2', latestKnownChapters: 75, anilistStatus: 'FINISHED', lastApiCheck: 2000 },
      ])

      const a = await service.getById('multi-1')
      const b = await service.getById('multi-2')
      expect(a!.latestKnownChapters).toBe(50)
      expect(b!.latestKnownChapters).toBe(75)
      expect(b!.anilistStatus).toBe('FINISHED')
    })

    it('silently skips unknown providerIds', async () => {
      await service.save(makeItem({ providerId: 'known-1' }))

      // Should not throw
      await service.bulkUpdateChapterInfo([
        { providerId: 'ghost', latestKnownChapters: 99, anilistStatus: null, lastApiCheck: 0 },
      ])

      const all = await service.getAll()
      expect(all).toHaveLength(1)
    })
  })

  // -------------------------------------------------------------------------
  // importData
  // -------------------------------------------------------------------------

  describe('importData', () => {
    it('imports new items that do not exist locally', async () => {
      const item = makeItem({ providerId: 'imp-1' })
      const data = makeExportedData([makeExportedItem(item)])

      const result = await service.importData(data)

      expect(result.imported).toBe(1)
      expect(result.updated).toBe(0)
      expect(result.skipped).toBe(0)

      const stored = await service.getById('imp-1')
      expect(stored).not.toBeNull()
      expect(stored!.providerId).toBe('imp-1')
    })

    it('sets lastApiCheck to null for newly imported items', async () => {
      const item = makeItem({ providerId: 'imp-api', lastApiCheck: 99999 })
      const data = makeExportedData([makeExportedItem(item)])

      await service.importData(data)

      const stored = await service.getById('imp-api')
      expect(stored!.lastApiCheck).toBeNull()
    })

    it('overwrites existing item when import has a newer updatedAt', async () => {
      const existing = makeItem({ providerId: 'upd-imp', updatedAt: 1000, progress: { unit: 'chapter', value: '3' } })
      await service.save(existing)

      const newer = makeItem({ providerId: 'upd-imp', updatedAt: 2000, progress: { unit: 'chapter', value: '10' } })
      const data = makeExportedData([makeExportedItem(newer)])

      const result = await service.importData(data)

      expect(result.imported).toBe(0)
      expect(result.updated).toBe(1)
      expect(result.skipped).toBe(0)

      const stored = await service.getById('upd-imp')
      expect(stored!.progress.value).toBe('10')
    })

    it('preserves local lastApiCheck when overwriting with a newer import', async () => {
      const existing = makeItem({ providerId: 'api-check', updatedAt: 1000, lastApiCheck: 5000 })
      await service.save(existing)

      const newer = makeExportedItem(makeItem({ providerId: 'api-check', updatedAt: 2000 }))
      const data = makeExportedData([newer])

      await service.importData(data)

      const stored = await service.getById('api-check')
      expect(stored!.lastApiCheck).toBe(5000)
    })

    it('skips import when existing item has a newer updatedAt', async () => {
      const existing = makeItem({ providerId: 'skip-imp', updatedAt: 9000, progress: { unit: 'chapter', value: '20' } })
      await service.save(existing)

      const older = makeItem({ providerId: 'skip-imp', updatedAt: 100, progress: { unit: 'chapter', value: '1' } })
      const data = makeExportedData([makeExportedItem(older)])

      const result = await service.importData(data)

      expect(result.imported).toBe(0)
      expect(result.updated).toBe(0)
      expect(result.skipped).toBe(1)

      // Local value should be unchanged
      const stored = await service.getById('skip-imp')
      expect(stored!.progress.value).toBe('20')
    })

    it('counts correctly across mixed import scenarios', async () => {
      // existing item that will be updated (import newer)
      await service.save(makeItem({ providerId: 'mix-update', updatedAt: 500 }))
      // existing item that will be skipped (import older)
      await service.save(makeItem({ providerId: 'mix-skip', updatedAt: 9000 }))

      const importItems: ExportedItem[] = [
        makeExportedItem(makeItem({ providerId: 'mix-new', updatedAt: 1000 })),       // new
        makeExportedItem(makeItem({ providerId: 'mix-update', updatedAt: 1000 })),    // newer → update
        makeExportedItem(makeItem({ providerId: 'mix-skip', updatedAt: 100 })),       // older → skip
      ]
      const data = makeExportedData(importItems)

      const result = await service.importData(data)

      expect(result.imported).toBe(1)
      expect(result.updated).toBe(1)
      expect(result.skipped).toBe(1)
    })

    it('imports settings when included in export data', async () => {
      const data = makeExportedData([])
      data.settings.checkIntervalMinutes = 120

      await service.importData(data)

      const settings = await service.getSettings()
      expect(settings.checkIntervalMinutes).toBe(120)
    })
  })

  describe('createList parentId validation', () => {
    it('creates a list at root when parentId is null', async () => {
      const list = await service.createList({
        name: 'Root',
        type: 'manual',
        itemIds: [],
        filters: null,
        parentId: null,
      })

      expect(list.parentId).toBeNull()
    })

    it('creates a child under a manual parent', async () => {
      const parent = await service.createList({
        name: 'Parent', type: 'manual', itemIds: [], filters: null, parentId: null,
      })

      const child = await service.createList({
        name: 'Child', type: 'manual', itemIds: [], filters: null, parentId: parent.id,
      })

      expect(child.parentId).toBe(parent.id)
    })

    it('rejects creation when parent does not exist', async () => {
      await expect(
        service.createList({
          name: 'X', type: 'manual', itemIds: [], filters: null, parentId: 'no-such-id',
        }),
      ).rejects.toThrow(/Parent list not found/)
    })

    it('rejects creation when parent is a smart list', async () => {
      const smart = await service.createList({
        name: 'Smart',
        type: 'smart',
        itemIds: [],
        filters: { formats: [], genres: [], tags: [] },
        parentId: null,
      })

      await expect(
        service.createList({
          name: 'X', type: 'manual', itemIds: [], filters: null, parentId: smart.id,
        }),
      ).rejects.toThrow(/Smart lists cannot contain sub-lists/)
    })

    it('rejects creation that would exceed depth 3', async () => {
      const a = await service.createList({ name: 'a', type: 'manual', itemIds: [], filters: null, parentId: null })
      const b = await service.createList({ name: 'b', type: 'manual', itemIds: [], filters: null, parentId: a.id })
      const c = await service.createList({ name: 'c', type: 'manual', itemIds: [], filters: null, parentId: b.id })

      await expect(
        service.createList({
          name: 'd', type: 'manual', itemIds: [], filters: null, parentId: c.id,
        }),
      ).rejects.toThrow(/Maximum nesting depth/)
    })
  })

  describe('updateList parentId validation', () => {
    it('allows moving a list to a new manual parent', async () => {
      const a = await service.createList({ name: 'a', type: 'manual', itemIds: [], filters: null, parentId: null })
      const b = await service.createList({ name: 'b', type: 'manual', itemIds: [], filters: null, parentId: null })
      const child = await service.createList({ name: 'child', type: 'manual', itemIds: [], filters: null, parentId: a.id })

      await service.updateList(child.id, { parentId: b.id })

      const result = (await service.getLists()).find((l) => l.id === child.id)
      expect(result?.parentId).toBe(b.id)
    })

    it('allows moving a list back to root', async () => {
      const a = await service.createList({ name: 'a', type: 'manual', itemIds: [], filters: null, parentId: null })
      const child = await service.createList({ name: 'child', type: 'manual', itemIds: [], filters: null, parentId: a.id })

      await service.updateList(child.id, { parentId: null })

      const result = (await service.getLists()).find((l) => l.id === child.id)
      expect(result?.parentId).toBeNull()
    })

    it('rejects moving a list into its own descendant (cycle)', async () => {
      const root = await service.createList({ name: 'root', type: 'manual', itemIds: [], filters: null, parentId: null })
      const child = await service.createList({ name: 'child', type: 'manual', itemIds: [], filters: null, parentId: root.id })

      await expect(
        service.updateList(root.id, { parentId: child.id }),
      ).rejects.toThrow(/Cannot move a list into its own descendants/)
    })

    it('rejects moving a list into itself', async () => {
      const a = await service.createList({ name: 'a', type: 'manual', itemIds: [], filters: null, parentId: null })

      await expect(
        service.updateList(a.id, { parentId: a.id }),
      ).rejects.toThrow(/Cannot move a list into its own descendants/)
    })

    it('rejects moves that would push subtree past depth 3', async () => {
      // Build:   r1 -> a -> b  (b at depth 2)
      //          r2 -> c -> d  (d at depth 2)
      // Try moving r1 under d → r1 would be depth 3 and a/b would be 4/5.
      const r1 = await service.createList({ name: 'r1', type: 'manual', itemIds: [], filters: null, parentId: null })
      const a = await service.createList({ name: 'a', type: 'manual', itemIds: [], filters: null, parentId: r1.id })
      await service.createList({ name: 'b', type: 'manual', itemIds: [], filters: null, parentId: a.id })
      const r2 = await service.createList({ name: 'r2', type: 'manual', itemIds: [], filters: null, parentId: null })
      const c = await service.createList({ name: 'c', type: 'manual', itemIds: [], filters: null, parentId: r2.id })
      const d = await service.createList({ name: 'd', type: 'manual', itemIds: [], filters: null, parentId: c.id })

      await expect(
        service.updateList(r1.id, { parentId: d.id }),
      ).rejects.toThrow(/Move would exceed maximum nesting depth/)
    })

    it('rejects moving a list under a smart parent', async () => {
      const smart = await service.createList({
        name: 'smart',
        type: 'smart',
        itemIds: [],
        filters: { formats: [], genres: [], tags: [] },
        parentId: null,
      })
      const manual = await service.createList({
        name: 'manual', type: 'manual', itemIds: [], filters: null, parentId: null,
      })

      await expect(
        service.updateList(manual.id, { parentId: smart.id }),
      ).rejects.toThrow(/Smart lists cannot contain sub-lists/)
    })

    it('rejects converting a manual list with children to smart', async () => {
      const parent = await service.createList({ name: 'p', type: 'manual', itemIds: [], filters: null, parentId: null })
      await service.createList({ name: 'c', type: 'manual', itemIds: [], filters: null, parentId: parent.id })

      await expect(
        service.updateList(parent.id, {
          type: 'smart',
          filters: { formats: [], genres: [], tags: [] },
        }),
      ).rejects.toThrow(/Convert children to root-level lists first/)
    })
  })

  describe('deleteList cascade', () => {
    it('deletes a leaf list with no descendants', async () => {
      const a = await service.createList({ name: 'a', type: 'manual', itemIds: [], filters: null, parentId: null })

      await service.deleteList(a.id)

      expect(await service.getLists()).toHaveLength(0)
    })

    it('cascade-deletes all descendants of a parent', async () => {
      const root = await service.createList({ name: 'root', type: 'manual', itemIds: [], filters: null, parentId: null })
      const child1 = await service.createList({ name: 'c1', type: 'manual', itemIds: [], filters: null, parentId: root.id })
      const child2 = await service.createList({ name: 'c2', type: 'manual', itemIds: [], filters: null, parentId: root.id })
      const grand = await service.createList({ name: 'g', type: 'manual', itemIds: [], filters: null, parentId: child1.id })
      const unrelated = await service.createList({ name: 'unrelated', type: 'manual', itemIds: [], filters: null, parentId: null })

      await service.deleteList(root.id)

      const remaining = await service.getLists()
      const ids = remaining.map((l) => l.id)
      expect(ids).toEqual([unrelated.id])
      // Sanity: targeted ids gone.
      expect(ids).not.toContain(root.id)
      expect(ids).not.toContain(child1.id)
      expect(ids).not.toContain(child2.id)
      expect(ids).not.toContain(grand.id)
    })

    it('does not touch tracked items when cascade-deleting lists', async () => {
      const item = makeItem({ providerId: 'item-99' })
      await service.save(item)
      const root = await service.createList({
        name: 'root', type: 'manual', itemIds: ['item-99'], filters: null, parentId: null,
      })
      await service.createList({ name: 'c', type: 'manual', itemIds: ['item-99'], filters: null, parentId: root.id })

      await service.deleteList(root.id)

      const items = await service.getAll()
      expect(items.find((i) => i.providerId === 'item-99')).toBeDefined()
    })
  })

  describe('list parentId backwards-compat', () => {
    it('defaults parentId to null when stored list has no parentId field', async () => {
      // Simulate a list written by a previous version (no parentId)
      const legacyList = {
        id: 'legacy-1',
        name: 'Reading',
        type: 'manual',
        itemIds: [],
        filters: null,
        createdAt: 1000,
        updatedAt: 1000,
      }
      await new Promise<void>((resolve) =>
        chrome.storage.local.set({ customLists: [legacyList] }, () => resolve()),
      )

      const result = await service.getLists()

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('legacy-1')
      expect(result[0].parentId).toBeNull()
    })

    it('preserves parentId when present in stored list', async () => {
      const storedList = {
        id: 'child-1',
        name: 'Cyberpunk',
        type: 'manual',
        itemIds: [],
        filters: null,
        parentId: 'parent-1',
        createdAt: 1000,
        updatedAt: 1000,
      }
      await new Promise<void>((resolve) =>
        chrome.storage.local.set({ customLists: [storedList] }, () => resolve()),
      )

      const result = await service.getLists()

      expect(result[0].parentId).toBe('parent-1')
    })
  })
})
