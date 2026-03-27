import { describe, it, expect, beforeEach } from 'vitest'
import { resetChromeStorage } from '@/__mocks__/chrome'
import { StorageService } from './storageService'
import type { TrackedItem, CustomList } from '@/shared/types'

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

function makeList(overrides: Partial<CustomList> = {}): CustomList {
  const id = String(idCounter++)
  return {
    id: `list-${id}`,
    name: `List ${id}`,
    type: 'manual',
    itemIds: [],
    filters: null,
    createdAt: 1000,
    updatedAt: 1000,
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

describe('StorageService — Custom Tags', () => {
  const service = new StorageService()

  // -------------------------------------------------------------------------
  // getCustomTags
  // -------------------------------------------------------------------------

  describe('getCustomTags', () => {
    it('returns empty registry when no tags exist', async () => {
      const tags = await service.getCustomTags()
      expect(tags).toEqual({})
    })

    it('returns stored tags after saving', async () => {
      await service.saveCustomTag('action', '#ff0000')
      const tags = await service.getCustomTags()
      expect(tags).toEqual({ action: { color: '#ff0000' } })
    })
  })

  // -------------------------------------------------------------------------
  // saveCustomTag
  // -------------------------------------------------------------------------

  describe('saveCustomTag', () => {
    it('saves a new tag with the given name and color', async () => {
      await service.saveCustomTag('romance', '#ff69b4')

      const tags = await service.getCustomTags()
      expect(tags['romance']).toEqual({ color: '#ff69b4' })
    })

    it('saves multiple tags independently', async () => {
      await service.saveCustomTag('action', '#ff0000')
      await service.saveCustomTag('comedy', '#00ff00')

      const tags = await service.getCustomTags()
      expect(Object.keys(tags)).toHaveLength(2)
      expect(tags['action']).toEqual({ color: '#ff0000' })
      expect(tags['comedy']).toEqual({ color: '#00ff00' })
    })

    it('overwrites an existing tag color when saving with same name', async () => {
      await service.saveCustomTag('action', '#ff0000')
      await service.saveCustomTag('action', '#0000ff')

      const tags = await service.getCustomTags()
      expect(tags['action']).toEqual({ color: '#0000ff' })
      expect(Object.keys(tags)).toHaveLength(1)
    })
  })

  // -------------------------------------------------------------------------
  // updateCustomTag — color only
  // -------------------------------------------------------------------------

  describe('updateCustomTag (color update)', () => {
    it('updates only the color of an existing tag', async () => {
      await service.saveCustomTag('drama', '#aabbcc')

      await service.updateCustomTag('drama', { color: '#112233' })

      const tags = await service.getCustomTags()
      expect(tags['drama']).toEqual({ color: '#112233' })
    })

    it('upserts a non-existent tag when color is provided', async () => {
      await service.saveCustomTag('real', '#ffffff')

      // Should create the tag (upsert behavior)
      await service.updateCustomTag('ghost', { color: '#000000' })

      const tags = await service.getCustomTags()
      expect(Object.keys(tags)).toHaveLength(2)
      expect(tags['ghost']).toEqual({ color: '#000000' })
    })

    it('is a no-op for a non-existent tag without color', async () => {
      await service.saveCustomTag('real', '#ffffff')

      // No color provided — cannot create, should be no-op
      await service.updateCustomTag('ghost', { newName: 'phantom' })

      const tags = await service.getCustomTags()
      expect(Object.keys(tags)).toHaveLength(1)
      expect(tags['ghost']).toBeUndefined()
      expect(tags['phantom']).toBeUndefined()
    })
  })

  // -------------------------------------------------------------------------
  // updateCustomTag — rename with cascade
  // -------------------------------------------------------------------------

  describe('updateCustomTag (rename)', () => {
    it('renames a tag in the registry', async () => {
      await service.saveCustomTag('old-name', '#aabbcc')

      await service.updateCustomTag('old-name', { newName: 'new-name' })

      const tags = await service.getCustomTags()
      expect(tags['old-name']).toBeUndefined()
      expect(tags['new-name']).toEqual({ color: '#aabbcc' })
    })

    it('cascades rename to items that carry the tag', async () => {
      await service.saveCustomTag('shounen', '#ff0000')
      const item = makeItem({ providerId: 'tag-item-1', tags: ['shounen', 'action'] })
      await service.save(item)

      await service.updateCustomTag('shounen', { newName: 'shonen' })

      const stored = await service.getById('tag-item-1')
      expect(stored!.tags).toContain('shonen')
      expect(stored!.tags).not.toContain('shounen')
      expect(stored!.tags).toContain('action') // unrelated tag preserved
    })

    it('only updates items that carry the renamed tag', async () => {
      await service.saveCustomTag('shounen', '#ff0000')
      const tagged = makeItem({ providerId: 'tagged', tags: ['shounen'] })
      const untagged = makeItem({ providerId: 'untagged', tags: ['romance'] })
      await service.save(tagged)
      await service.save(untagged)

      await service.updateCustomTag('shounen', { newName: 'shonen' })

      const storedTagged = await service.getById('tagged')
      const storedUntagged = await service.getById('untagged')
      expect(storedTagged!.tags).toEqual(['shonen'])
      expect(storedUntagged!.tags).toEqual(['romance'])
    })

    it('cascades rename to smart list filter entries', async () => {
      await service.saveCustomTag('action', '#ff0000')
      const list = makeList({
        type: 'smart',
        filters: {
          formats: [],
          genres: [],
          tags: [{ value: 'action', mode: 'and' }],
        },
      })
      const created = await service.createList({
        name: list.name,
        type: 'smart',
        itemIds: [],
        filters: list.filters,
      })

      await service.updateCustomTag('action', { newName: 'battle' })

      const lists = await service.getLists()
      const updated = lists.find((l) => l.id === created.id)!
      const tagFilters = updated.filters!.tags
      expect(tagFilters.some((f) => f.value === 'battle')).toBe(true)
      expect(tagFilters.some((f) => f.value === 'action')).toBe(false)
    })

    it('renames tag while also updating color if both provided', async () => {
      await service.saveCustomTag('old', '#111111')

      await service.updateCustomTag('old', { newName: 'new', color: '#999999' })

      const tags = await service.getCustomTags()
      expect(tags['new']).toEqual({ color: '#999999' })
      expect(tags['old']).toBeUndefined()
    })
  })

  // -------------------------------------------------------------------------
  // deleteCustomTag
  // -------------------------------------------------------------------------

  describe('deleteCustomTag', () => {
    it('removes the tag from the registry', async () => {
      await service.saveCustomTag('delete-me', '#123456')

      await service.deleteCustomTag('delete-me')

      const tags = await service.getCustomTags()
      expect(tags['delete-me']).toBeUndefined()
    })

    it('cascades deletion to items that carry the tag', async () => {
      await service.saveCustomTag('remove-tag', '#ffffff')
      const item = makeItem({ providerId: 'del-tag-item', tags: ['remove-tag', 'keep-tag'] })
      await service.save(item)

      await service.deleteCustomTag('remove-tag')

      const stored = await service.getById('del-tag-item')
      expect(stored!.tags).not.toContain('remove-tag')
      expect(stored!.tags).toContain('keep-tag')
    })

    it('only removes the deleted tag from items, preserving others', async () => {
      await service.saveCustomTag('gone', '#000000')
      const a = makeItem({ providerId: 'item-a', tags: ['gone', 'stays'] })
      const b = makeItem({ providerId: 'item-b', tags: ['stays'] })
      await service.save(a)
      await service.save(b)

      await service.deleteCustomTag('gone')

      const storedA = await service.getById('item-a')
      const storedB = await service.getById('item-b')
      expect(storedA!.tags).toEqual(['stays'])
      expect(storedB!.tags).toEqual(['stays'])
    })

    it('cascades deletion to smart list filter entries', async () => {
      await service.saveCustomTag('to-delete', '#abcdef')
      const created = await service.createList({
        name: 'Smart List',
        type: 'smart',
        itemIds: [],
        filters: {
          formats: [],
          genres: [],
          tags: [
            { value: 'to-delete', mode: 'and' },
            { value: 'keep-filter', mode: 'or' },
          ],
        },
      })

      await service.deleteCustomTag('to-delete')

      const lists = await service.getLists()
      const updated = lists.find((l) => l.id === created.id)!
      const tagFilters = updated.filters!.tags
      expect(tagFilters.some((f) => f.value === 'to-delete')).toBe(false)
      expect(tagFilters.some((f) => f.value === 'keep-filter')).toBe(true)
    })

    it('is a no-op for a non-existent tag', async () => {
      await service.saveCustomTag('real-tag', '#ffffff')

      // Should not throw
      await service.deleteCustomTag('phantom-tag')

      const tags = await service.getCustomTags()
      expect(Object.keys(tags)).toHaveLength(1)
    })
  })
})
