import { useState, useEffect, useCallback } from 'react'
import type { TrackedItem, ExtensionSettings } from '@/shared/types'
import { getAllItems } from '../services/messaging'

type Format = TrackedItem['format']
type SortOrder = ExtensionSettings['sortOrder']

function sortItems(items: TrackedItem[], sortOrder: SortOrder): TrackedItem[] {
  const pinned = items.filter((item) => item.pinned)
  const unpinned = items.filter((item) => !item.pinned)

  const compareFn = (a: TrackedItem, b: TrackedItem): number => {
    switch (sortOrder) {
      case 'alphabetical':
        return a.titles.main.localeCompare(b.titles.main)
      case 'chaptersAhead': {
        const aAhead = (a.latestKnownChapters ?? 0) - (parseFloat(a.progress.value) || 0)
        const bAhead = (b.latestKnownChapters ?? 0) - (parseFloat(b.progress.value) || 0)
        return bAhead - aAhead
      }
      case 'createdAt':
        return b.createdAt - a.createdAt
      case 'updatedAt':
      default:
        return b.updatedAt - a.updatedAt
    }
  }

  pinned.sort(compareFn)
  unpinned.sort(compareFn)

  return [...pinned, ...unpinned]
}

export function useTrackedItems(format?: Format, sortOrder: SortOrder = 'updatedAt') {
  const [items, setItems] = useState<TrackedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const result = await getAllItems(format)
      setItems(sortItems(result, sortOrder))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load items')
    } finally {
      setLoading(false)
    }
  }, [format, sortOrder])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if ('trackedItems' in changes && changes.trackedItems.newValue) {
        const newItems = changes.trackedItems.newValue as TrackedItem[]
        const filtered = format
          ? newItems.filter((item) => item.format === format)
          : newItems
        setItems(sortItems(filtered, sortOrder))
        setError(null)
        setLoading(false)
      }
    }
    chrome.storage.onChanged.addListener(listener)
    return () => chrome.storage.onChanged.removeListener(listener)
  }, [format, sortOrder])

  return { items, loading, error, refresh }
}
