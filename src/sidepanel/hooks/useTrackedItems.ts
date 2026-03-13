import { useState, useEffect, useCallback } from 'react'
import type { TrackedItem } from '@/shared/types'
import { getAllItems } from '../services/messaging'

type Format = TrackedItem['format']

export function useTrackedItems(format?: Format) {
  const [items, setItems] = useState<TrackedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const result = await getAllItems(format)
      setItems(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load items')
    } finally {
      setLoading(false)
    }
  }, [format])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Patch state in-place from storage change events instead of re-fetching
  useEffect(() => {
    const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if ('trackedItems' in changes && changes.trackedItems.newValue) {
        const newItems = changes.trackedItems.newValue as TrackedItem[]

        const filtered = format
          ? newItems.filter((item) => item.format === format)
          : newItems
        const sorted = filtered.sort((a, b) => b.updatedAt - a.updatedAt)

        setItems(sorted)
        setError(null)
        setLoading(false)
      }
    }
    chrome.storage.onChanged.addListener(listener)
    return () => chrome.storage.onChanged.removeListener(listener)
  }, [format])

  return { items, loading, error, refresh }
}
