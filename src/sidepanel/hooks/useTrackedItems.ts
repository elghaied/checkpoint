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

  return { items, loading, error, refresh }
}
