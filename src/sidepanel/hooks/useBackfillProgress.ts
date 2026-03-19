import { useState, useEffect } from 'react'
import type { BackfillProgress } from '@/shared/types'
import { BACKFILL_PROGRESS_KEY } from '@/shared/constants'

export function useBackfillProgress() {
  const [progress, setProgress] = useState<BackfillProgress | null>(null)

  useEffect(() => {
    // Read initial state
    chrome.storage.local.get(BACKFILL_PROGRESS_KEY, (result) => {
      const p = result[BACKFILL_PROGRESS_KEY] as BackfillProgress | undefined
      if (p && p.status !== 'done') setProgress(p)
    })

    // Listen for changes
    const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes[BACKFILL_PROGRESS_KEY]) {
        const newVal = changes[BACKFILL_PROGRESS_KEY].newValue as BackfillProgress | null
        if (newVal?.status === 'done') {
          setProgress(null)
          chrome.storage.local.remove(BACKFILL_PROGRESS_KEY)
        } else {
          setProgress(newVal ?? null)
        }
      }
    }

    chrome.storage.onChanged.addListener(listener)
    return () => chrome.storage.onChanged.removeListener(listener)
  }, [])

  return progress
}
