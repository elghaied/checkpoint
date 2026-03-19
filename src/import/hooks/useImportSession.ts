import { useState, useEffect, useCallback } from 'react'
import type { ImportSession, PendingReviewList } from '@/shared/importTypes'
import { IMPORT_SESSION_KEY, PENDING_REVIEW_KEY, PENDING_REVIEW_MAX_AGE_MS } from '@/shared/constants'

interface UseImportSessionReturn {
  session: ImportSession | null
  pendingReview: PendingReviewList | null
  loading: boolean
  saveSession: (session: ImportSession) => Promise<void>
  clearSession: () => Promise<void>
  savePendingReview: (list: PendingReviewList) => Promise<void>
  clearPendingReview: () => Promise<void>
}

export function useImportSession(): UseImportSessionReturn {
  const [session, setSession] = useState<ImportSession | null>(null)
  const [pendingReview, setPendingReview] = useState<PendingReviewList | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    chrome.storage.local.get([IMPORT_SESSION_KEY, PENDING_REVIEW_KEY], (result) => {
      const loadedSession = result[IMPORT_SESSION_KEY] as ImportSession | undefined
      const loadedPending = result[PENDING_REVIEW_KEY] as PendingReviewList | undefined

      if (loadedSession) {
        setSession(loadedSession)
      }

      if (loadedPending) {
        if (Date.now() - loadedPending.lastActivityAt > PENDING_REVIEW_MAX_AGE_MS) {
          chrome.storage.local.remove(PENDING_REVIEW_KEY)
        } else {
          setPendingReview(loadedPending)
        }
      }

      setLoading(false)
    })

    const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (IMPORT_SESSION_KEY in changes) {
        setSession((changes[IMPORT_SESSION_KEY].newValue as ImportSession | undefined) ?? null)
      }
      if (PENDING_REVIEW_KEY in changes) {
        setPendingReview((changes[PENDING_REVIEW_KEY].newValue as PendingReviewList | undefined) ?? null)
      }
    }
    chrome.storage.local.onChanged.addListener(listener)
    return () => chrome.storage.local.onChanged.removeListener(listener)
  }, [])

  const saveSession = useCallback(async (s: ImportSession) => {
    const updated = { ...s, lastActivityAt: Date.now() }
    await chrome.storage.local.set({ [IMPORT_SESSION_KEY]: updated })
    setSession(updated)
  }, [])

  const clearSession = useCallback(async () => {
    await chrome.storage.local.remove(IMPORT_SESSION_KEY)
    setSession(null)
  }, [])

  const savePendingReview = useCallback(async (list: PendingReviewList) => {
    await chrome.storage.local.set({ [PENDING_REVIEW_KEY]: list })
    setPendingReview(list)
  }, [])

  const clearPendingReview = useCallback(async () => {
    await chrome.storage.local.remove(PENDING_REVIEW_KEY)
    setPendingReview(null)
  }, [])

  return { session, pendingReview, loading, saveSession, clearSession, savePendingReview, clearPendingReview }
}
