import { useState, useEffect, useCallback } from 'react'
import { IMPORT_SESSION_KEY, PENDING_REVIEW_KEY, PENDING_REVIEW_MAX_AGE_MS } from '@/shared/constants'
import type { ImportRow, ImportSession, PendingReviewList } from '@/shared/importTypes'

interface UsePendingReviewReturn {
  pendingCount: number
  importInProgress: { done: number; total: number } | null
  openImportTab: () => void
  dismissPending: () => void
}

export function usePendingReview(): UsePendingReviewReturn {
  const [pendingCount, setPendingCount] = useState(0)
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null)

  useEffect(() => {
    chrome.storage.local.get([IMPORT_SESSION_KEY, PENDING_REVIEW_KEY], (result) => {
      const session = result[IMPORT_SESSION_KEY] as ImportSession | undefined
      const pending = result[PENDING_REVIEW_KEY] as PendingReviewList | undefined

      if (session) {
        const done = session.rows.filter((r) => r.matchStatus !== 'pending').length
        setImportProgress({ done, total: session.rows.length })
      } else if (pending) {
        if (Date.now() - pending.lastActivityAt > PENDING_REVIEW_MAX_AGE_MS) {
          chrome.storage.local.remove(PENDING_REVIEW_KEY)
        } else {
          setPendingCount(pending.items.length)
        }
      }
    })

    const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (IMPORT_SESSION_KEY in changes) {
        const session = changes[IMPORT_SESSION_KEY].newValue as ImportSession | undefined
        if (session) {
          const done = session.rows.filter((r: ImportRow) => r.matchStatus !== 'pending').length
          setImportProgress({ done, total: session.rows.length })
        } else {
          setImportProgress(null)
        }
      }
      if (PENDING_REVIEW_KEY in changes) {
        const pending = changes[PENDING_REVIEW_KEY].newValue as PendingReviewList | undefined
        setPendingCount(pending?.items.length ?? 0)
      }
    }
    chrome.storage.local.onChanged.addListener(listener)
    return () => chrome.storage.local.onChanged.removeListener(listener)
  }, [])

  const openImportTab = useCallback(() => {
    chrome.tabs.create({ url: chrome.runtime.getURL('import/index.html') })
  }, [])

  const dismissPending = useCallback(() => {
    if (confirm('Discard ' + pendingCount + ' unreviewed titles? This can\'t be undone.')) {
      chrome.storage.local.remove(PENDING_REVIEW_KEY)
      setPendingCount(0)
    }
  }, [pendingCount])

  return { pendingCount, importInProgress: importProgress, openImportTab, dismissPending }
}
