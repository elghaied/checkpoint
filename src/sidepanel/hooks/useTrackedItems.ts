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

  // Auto-refresh when storage changes (e.g. background chapter checker)
  useEffect(() => {
    const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if ('trackedItems' in changes) {
        refresh()
      }
    }
    chrome.storage.onChanged.addListener(listener)
    return () => chrome.storage.onChanged.removeListener(listener)
  }, [refresh])

  return { items, loading, error, refresh }
}
