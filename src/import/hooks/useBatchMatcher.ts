import { useState, useRef, useCallback, useEffect } from 'react'
import { importSearch, setImportStatus, getAllItems } from '../services/messaging'
import { classifyMatchTier, detectDuplicates } from '../confirmLogic'
import { cleanSearchQuery } from '@/shared/utils'
import { IMPORT_BATCH_CHECKPOINT_SIZE } from '@/shared/constants'
import type { ImportSession, ImportRow } from '@/shared/importTypes'
import type { UnifiedSearchResult } from '@/shared/types'

export interface BatchMatcherState {
  isRunning: boolean
  isPaused: boolean
  currentTitle: string | null
  progress: { done: number; total: number }
  tally: { green: number; yellow: number; red: number; failed: number }
  startedAt: number | null
}

export interface UseBatchMatcherReturn extends BatchMatcherState {
  start: (session: ImportSession) => void
  pause: () => void
  resume: () => void
  cancel: () => void
  retryFailed: () => void
}

export function useBatchMatcher(
  onCheckpoint: (session: ImportSession) => Promise<void>,
  onComplete: (session: ImportSession) => Promise<void>,
): UseBatchMatcherReturn {
  const [state, setState] = useState<BatchMatcherState>({
    isRunning: false,
    isPaused: false,
    currentTitle: null,
    progress: { done: 0, total: 0 },
    tally: { green: 0, yellow: 0, red: 0, failed: 0 },
    startedAt: null,
  })

  const pausedRef = useRef(false)
  const cancelledRef = useRef(false)
  const sessionRef = useRef<ImportSession | null>(null)

  // Notify SW of import status inactive on unmount
  useEffect(() => {
    return () => {
      setImportStatus(false).catch(() => {})
    }
  }, [])

  function computeTally(rows: ImportRow[]): { green: number; yellow: number; red: number; failed: number } {
    let green = 0, yellow = 0, red = 0, failed = 0
    for (const row of rows) {
      if (row.matchStatus === 'failed') { failed++; continue }
      if (row.matchStatus === 'matched') {
        if (row.matchTier === 'green') green++
        else if (row.matchTier === 'yellow') yellow++
        else red++
      }
    }
    return { green, yellow, red, failed }
  }

  const runLoop = useCallback(async (session: ImportSession) => {
    pausedRef.current = false
    cancelledRef.current = false

    const rows = session.rows
    const total = rows.length
    const pendingIndices = rows
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => r.matchStatus === 'pending')
      .map(({ i }) => i)

    let done = rows.filter((r) => r.matchStatus !== 'pending').length

    setState((prev) => ({
      ...prev,
      isRunning: true,
      isPaused: false,
      progress: { done, total },
      tally: computeTally(rows),
      startedAt: prev.startedAt ?? Date.now(),
    }))

    await setImportStatus(true).catch(() => {})

    let processedSinceCheckpoint = 0

    for (const idx of pendingIndices) {
      // Check cancel
      if (cancelledRef.current) {
        await setImportStatus(false).catch(() => {})
        setState((prev) => ({ ...prev, isRunning: false, currentTitle: null }))
        return
      }

      // Check pause
      if (pausedRef.current) {
        // Save checkpoint before returning
        const current = sessionRef.current
        if (current) {
          await onCheckpoint(current).catch(() => {})
        }
        setState((prev) => ({ ...prev, isPaused: true, currentTitle: null }))
        return
      }

      const row = rows[idx]
      setState((prev) => ({ ...prev, currentTitle: row.csvTitle }))

      let matched = false
      let retrying = true

      while (retrying) {
        retrying = false
        try {
          const query = cleanSearchQuery(row.csvTitle)
          const result = await importSearch(query, row.csvTitle)

          if ('rateLimited' in result && result.rateLimited) {
            // Wait and retry
            const waitMs = result.waitMs
            await new Promise((resolve) => setTimeout(resolve, waitMs))
            retrying = true
            continue
          }

          const results = result as UnifiedSearchResult[]

          if (results.length === 0) {
            rows[idx] = {
              ...row,
              matchStatus: 'matched',
              matchTier: 'red',
              bestMatch: null,
              alternatives: [],
              confidenceScore: null,
            }
          } else {
            const best = results[0]
            const score = best.confidence
            const tier = classifyMatchTier(score)
            const alternatives = results.slice(1, 5)

            rows[idx] = {
              ...row,
              matchStatus: 'matched',
              matchTier: tier,
              bestMatch: best,
              alternatives,
              confidenceScore: score,
            }
          }

          matched = true
        } catch {
          rows[idx] = { ...row, matchStatus: 'failed' }
          matched = true
        }
      }

      if (matched) {
        done++
        processedSinceCheckpoint++

        // Update session ref with current rows
        const updatedSession: ImportSession = {
          ...session,
          rows: [...rows],
          lastActivityAt: Date.now(),
        }
        sessionRef.current = updatedSession

        setState((prev) => ({
          ...prev,
          progress: { done, total },
          tally: computeTally(rows),
        }))

        // Checkpoint every N rows
        if (processedSinceCheckpoint >= IMPORT_BATCH_CHECKPOINT_SIZE) {
          processedSinceCheckpoint = 0
          await onCheckpoint(updatedSession).catch(() => {})
        }
      }
    }

    // Loop complete — run duplicate detection
    let finalRows = [...rows]
    try {
      const existingItems = await getAllItems()
      finalRows = detectDuplicates(finalRows, existingItems)
    } catch {
      // Non-fatal: continue without duplicate detection
    }

    const completedSession: ImportSession = {
      ...session,
      phase: 'review',
      rows: finalRows,
      lastActivityAt: Date.now(),
    }
    sessionRef.current = completedSession

    setState((prev) => ({
      ...prev,
      isRunning: false,
      currentTitle: null,
      progress: { done: total, total },
      tally: computeTally(finalRows),
    }))

    await setImportStatus(false).catch(() => {})
    await onComplete(completedSession).catch(() => {})
  }, [onCheckpoint, onComplete])

  const start = useCallback((session: ImportSession) => {
    sessionRef.current = { ...session }
    // Update rows array reference in sessionRef to a mutable copy
    sessionRef.current = { ...session, rows: session.rows.map((r) => ({ ...r })) }
    runLoop(sessionRef.current)
  }, [runLoop])

  const pause = useCallback(() => {
    pausedRef.current = true
  }, [])

  const resume = useCallback(() => {
    if (!sessionRef.current) return
    pausedRef.current = false
    setState((prev) => ({ ...prev, isPaused: false }))
    runLoop(sessionRef.current)
  }, [runLoop])

  const cancel = useCallback(() => {
    cancelledRef.current = true
    setImportStatus(false).catch(() => {})
    setState((prev) => ({
      ...prev,
      isRunning: false,
      isPaused: false,
      currentTitle: null,
    }))
  }, [])

  const retryFailed = useCallback(() => {
    if (!sessionRef.current) return
    const updatedRows = sessionRef.current.rows.map((row) =>
      row.matchStatus === 'failed' ? { ...row, matchStatus: 'pending' as const } : row
    )
    const updatedSession: ImportSession = {
      ...sessionRef.current,
      rows: updatedRows,
    }
    sessionRef.current = updatedSession
    runLoop(updatedSession)
  }, [runLoop])

  return {
    ...state,
    start,
    pause,
    resume,
    cancel,
    retryFailed,
  }
}
