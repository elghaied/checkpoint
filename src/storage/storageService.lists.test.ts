import { describe, it, expect, beforeEach } from 'vitest'
import { resetChromeStorage } from '@/__mocks__/chrome'
import { StorageService } from './storageService'
import type { TrackedItem } from '@/shared/types'

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetChromeStorage()
  idCounter = 1
})

describe('StorageService — Custom Lists', () => {
  const service = new StorageService()

  // -------------------------------------------------------------------------
  // getLists
  // -------------------------------------------------------------------------

  describe('getLists', () => {
    it('returns empty array when no lists exist', async () => {
      const lists = await service.getLists()
      expect(lists).toEqual([])
    })

    it('returns all created lists', async () => {
      await service.createList({ name: 'List A', type: 'manual', itemIds: [], filters: null })
      await service.createList({ name: 'List B', type: 'manual', itemIds: [], filters: null })

      const lists = await service.getLists()
      expect(lists).toHaveLength(2)
    })
  })

  // -------------------------------------------------------------------------
  // createList
  // -------------------------------------------------------------------------

  describe('createList', () => {
    it('creates a manual list with generated id and timestamps', async () => {
      const before = Date.now()
      const created = await service.createList({
        name: 'My Reading List',
        type: 'manual',
        itemIds: [],
        filters: null,
      })
      const after = Date.now()

      expect(created.id).toBeDefined()
      expect(typeof created.id).toBe('string')
      expect(created.id.length).toBeGreaterThan(0)
      expect(created.name).toBe('My Reading List')
      expect(created.type).toBe('manual')
      expect(created.itemIds).toEqual([])
      expect(created.filters).toBeNull()
      expect(created.createdAt).toBeGreaterThanOrEqual(before)
      expect(created.createdAt).toBeLessThanOrEqual(after)
      expect(created.updatedAt).toBeGreaterThanOrEqual(before)
      expect(created.updatedAt).toBeLessThanOrEqual(after)
    })

    it('persists the list so it can be retrieved via getLists', async () => {
      const created = await service.createList({
        name: 'Persisted List',
        type: 'manual',
        itemIds: [],
        filters: null,
      })

      const lists = await service.getLists()
      expect(lists.find((l) => l.id === created.id)).toBeDefined()
    })

    it('creates a smart list with filters', async () => {
      const filters = {
        formats: ['MANGA'],
        genres: [{ value: 'Action', mode: 'and' as const }],
        tags: [],
      }

      const created = await service.createList({
        name: 'Action Manga',
        type: 'smart',
        itemIds: [],
        filters,
      })

      expect(created.type).toBe('smart')
      expect(created.filters).toEqual(filters)
    })

    it('generates unique ids for each list', async () => {
      const a = await service.createList({ name: 'A', type: 'manual', itemIds: [], filters: null })
      const b = await service.createList({ name: 'B', type: 'manual', itemIds: [], filters: null })

      expect(a.id).not.toBe(b.id)
    })
  })

  // -------------------------------------------------------------------------
  // updateList
  // -------------------------------------------------------------------------

  describe('updateList', () => {
    it('updates the name of an existing list', async () => {
      const created = await service.createList({
        name: 'Old Name',
        type: 'manual',
        itemIds: [],
        filters: null,
      })

      await service.updateList(created.id, { name: 'New Name' })

      const lists = await service.getLists()
      const updated = lists.find((l) => l.id === created.id)!
      expect(updated.name).toBe('New Name')
    })

    it('auto-sets updatedAt on update', async () => {
      const created = await service.createList({
        name: 'Timestamped',
        type: 'manual',
        itemIds: [],
        filters: null,
      })

      const before = Date.now()
      await service.updateList(created.id, { name: 'Updated' })
      const after = Date.now()

      const lists = await service.getLists()
      const updated = lists.find((l) => l.id === created.id)!
      expect(updated.updatedAt).toBeGreaterThanOrEqual(before)
      expect(updated.updatedAt).toBeLessThanOrEqual(after)
    })

    it('protects the id from being overwritten', async () => {
      const created = await service.createList({
        name: 'Protected',
        type: 'manual',
        itemIds: [],
        filters: null,
      })

      await service.updateList(created.id, { id: 'hacked-id' } as Partial<typeof created>)

      const lists = await service.getLists()
      const found = lists.find((l) => l.id === created.id)
      expect(found).toBeDefined()
      expect(lists.find((l) => l.id === 'hacked-id')).toBeUndefined()
    })

    it('adds items to a manual list via itemIds update', async () => {
      const item = makeItem({ providerId: 'list-item-1' })
      await service.save(item)

      const created = await service.createList({
        name: 'Manual',
        type: 'manual',
        itemIds: [],
        filters: null,
      })

      await service.updateList(created.id, { itemIds: ['list-item-1'] })

      const lists = await service.getLists()
      const updated = lists.find((l) => l.id === created.id)!
      expect(updated.itemIds).toContain('list-item-1')
    })

    it('removes items from a manual list via itemIds update', async () => {
      const created = await service.createList({
        name: 'Manual',
        type: 'manual',
        itemIds: ['item-a', 'item-b'],
        filters: null,
      })

      await service.updateList(created.id, { itemIds: ['item-a'] })

      const lists = await service.getLists()
      const updated = lists.find((l) => l.id === created.id)!
      expect(updated.itemIds).toEqual(['item-a'])
    })

    it('is a no-op for a non-existent list id', async () => {
      await service.createList({ name: 'Existing', type: 'manual', itemIds: [], filters: null })

      // Should not throw
      await service.updateList('ghost-list-id', { name: 'Ghost' })

      const lists = await service.getLists()
      expect(lists).toHaveLength(1)
      expect(lists[0].name).toBe('Existing')
    })
  })

  // -------------------------------------------------------------------------
  // deleteList
  // -------------------------------------------------------------------------

  describe('deleteList', () => {
    it('removes a list by id', async () => {
      const created = await service.createList({
        name: 'To Delete',
        type: 'manual',
        itemIds: [],
        filters: null,
      })

      await service.deleteList(created.id)

      const lists = await service.getLists()
      expect(lists.find((l) => l.id === created.id)).toBeUndefined()
    })

    it('removes only the targeted list when multiple exist', async () => {
      const a = await service.createList({ name: 'A', type: 'manual', itemIds: [], filters: null })
      const b = await service.createList({ name: 'B', type: 'manual', itemIds: [], filters: null })
      const c = await service.createList({ name: 'C', type: 'manual', itemIds: [], filters: null })

      await service.deleteList(b.id)

      const lists = await service.getLists()
      expect(lists).toHaveLength(2)
      expect(lists.find((l) => l.id === a.id)).toBeDefined()
      expect(lists.find((l) => l.id === b.id)).toBeUndefined()
      expect(lists.find((l) => l.id === c.id)).toBeDefined()
    })

    it('is a no-op for a non-existent list id', async () => {
      await service.createList({ name: 'Real', type: 'manual', itemIds: [], filters: null })

      // Should not throw
      await service.deleteList('phantom-list-id')

      const lists = await service.getLists()
      expect(lists).toHaveLength(1)
    })
  })

  // -------------------------------------------------------------------------
  // delete (item) — cleanup from lists
  // -------------------------------------------------------------------------

  describe('delete item cleans up from lists', () => {
    it('removes a deleted item from all manual lists', async () => {
      const item = makeItem({ providerId: 'tracked-1' })
      await service.save(item)

      const list = await service.createList({
        name: 'List With Item',
        type: 'manual',
        itemIds: ['tracked-1'],
        filters: null,
      })

      await service.delete('tracked-1')

      const lists = await service.getLists()
      const updated = lists.find((l) => l.id === list.id)!
      expect(updated.itemIds).not.toContain('tracked-1')
    })

    it('removes item from multiple lists when it appears in more than one', async () => {
      const item = makeItem({ providerId: 'multi-list-item' })
      await service.save(item)

      const listA = await service.createList({
        name: 'List A',
        type: 'manual',
        itemIds: ['multi-list-item', 'other-item'],
        filters: null,
      })
      const listB = await service.createList({
        name: 'List B',
        type: 'manual',
        itemIds: ['multi-list-item'],
        filters: null,
      })

      await service.delete('multi-list-item')

      const lists = await service.getLists()
      const updatedA = lists.find((l) => l.id === listA.id)!
      const updatedB = lists.find((l) => l.id === listB.id)!
      expect(updatedA.itemIds).toEqual(['other-item'])
      expect(updatedB.itemIds).toEqual([])
    })

    it('does not modify smart lists (no itemIds to clean up)', async () => {
      const item = makeItem({ providerId: 'smart-list-item' })
      await service.save(item)

      const smartList = await service.createList({
        name: 'Smart List',
        type: 'smart',
        itemIds: [],
        filters: { formats: ['MANGA'], genres: [], tags: [] },
      })

      await service.delete('smart-list-item')

      const lists = await service.getLists()
      const updated = lists.find((l) => l.id === smartList.id)!
      // Smart list should be unchanged
      expect(updated.itemIds).toEqual([])
    })
  })

  // -------------------------------------------------------------------------
  // Backfill progress
  // -------------------------------------------------------------------------

  describe('backfill progress', () => {
    it('returns undefined (or null) when no backfill progress exists', async () => {
      const progress = await service.getBackfillProgress()
      expect(progress).toBeFalsy()
    })

    it('writes and reads backfill progress', async () => {
      await service.writeBackfillProgress({ completed: 5, total: 20, status: 'running' })

      const progress = await service.getBackfillProgress()
      expect(progress).toEqual({ completed: 5, total: 20, status: 'running' })
    })

    it('overwrites existing backfill progress', async () => {
      await service.writeBackfillProgress({ completed: 1, total: 10, status: 'running' })
      await service.writeBackfillProgress({ completed: 10, total: 10, status: 'done' })

      const progress = await service.getBackfillProgress()
      expect(progress).toEqual({ completed: 10, total: 10, status: 'done' })
    })
  })
})
