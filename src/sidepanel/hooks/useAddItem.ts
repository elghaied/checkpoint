import { useState } from 'react'
import type { TrackedItem, ComicKMedia, PageMetadata, UnifiedSearchResult } from '@/shared/types'
import { extractMetadata, searchManga, saveItem, findByTitle, enrichComicK } from '../services/messaging'
import { TOAST_DURATION_MS } from '@/shared/constants'
import { createLogger } from '@/shared/logger'

const log = createLogger('app')

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Request timed out')), ms)
    ),
  ])
}

function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  if (msg.includes('Cannot extract metadata')) return msg
  if (msg.includes('Could not establish connection')) return 'Navigate to a manga reading site and try again'
  if (msg.includes('No active tab')) return 'Navigate to a manga page first'
  if (msg.includes('timed out')) return 'Request timed out — check your connection'
  return msg
}

function logErr(err: unknown): unknown {
  if (err instanceof Error) return { message: err.message, stack: err.stack }
  return err
}

interface AddItemState {
  status: 'idle' | 'extracting' | 'searching' | 'selecting' | 'saving' | 'success' | 'error'
  metadata: PageMetadata | null
  searchResults: UnifiedSearchResult[] | null
  error: string | null
  originalExtractedTitle: string | null
}

export function useAddItem(onSuccess: () => void) {
  const [state, setState] = useState<AddItemState>({
    status: 'idle',
    metadata: null,
    searchResults: null,
    error: null,
    originalExtractedTitle: null,
  })

  const startAdd = async () => {
    setState({ status: 'extracting', metadata: null, searchResults: null, error: null, originalExtractedTitle: null })

    try {
      // Extract metadata from current page
      const metadata = await withTimeout(extractMetadata(), 10000)
      setState((prev) => ({ ...prev, status: 'searching', metadata }))

      // Check local storage first
      const query = metadata.detectedTitle || metadata.rawTitle
      setState((prev) => ({ ...prev, originalExtractedTitle: query }))
      const existingItem = await findByTitle(query)

      if (existingItem) {
        // Item already tracked - update progress if higher
        const currentProgress = parseFloat(existingItem.progress.value) || 0
        const newProgress = parseFloat(metadata.chapterNumber || '0') || 0

        if (newProgress > currentProgress) {
          // Save will handle the upsert
          await saveItem({
            ...existingItem,
            progress: { ...existingItem.progress, value: metadata.chapterNumber || '0' },
            lastUrl: metadata.pageUrl,
            updatedAt: Date.now(),
          })
        }

        setState({ status: 'success', metadata: null, searchResults: null, error: null, originalExtractedTitle: null })
        onSuccess()

        setTimeout(() => {
          setState({ status: 'idle', metadata: null, searchResults: null, error: null, originalExtractedTitle: null })
        }, TOAST_DURATION_MS)
        return
      }

      // Search with fallback (AniList → MangaDex)
      const results = await withTimeout(searchManga(query, query), 15000)

      if (results.length === 0) {
        setState((prev) => ({ ...prev, status: 'selecting', searchResults: [] }))
        return
      }

      if (results.length === 1) {
        // Auto-select single result
        await selectResult(results[0], metadata)
      } else {
        // Show selection modal
        setState((prev) => ({ ...prev, status: 'selecting', searchResults: results }))
      }
    } catch (err) {
      log.error('add-item start failed', { err: logErr(err) })
      setState((prev) => ({
        ...prev,
        status: 'error',
        error: friendlyError(err),
      }))
    }
  }

  const selectResult = async (result: UnifiedSearchResult, metadata?: PageMetadata) => {
    const meta = metadata || state.metadata
    if (!meta) return

    setState((prev) => ({ ...prev, status: 'saving' }))

    try {
      const now = Date.now()

      // Build alt titles from the unified result
      const altTitles = [...result.title.alt].filter(Boolean)

      // Include the original extracted title in alt names if it's different
      const originalTitle = state.originalExtractedTitle
      if (originalTitle && !altTitles.some((t) => t.toLowerCase().trim() === originalTitle.toLowerCase().trim())) {
        altTitles.push(originalTitle)
      }

      // Extract status from the unified result (works for all providers)
      const providerStatus = result.status

      // Extract ComicK cross-reference fields if available
      let comickHid: string | null = null
      let comickSlug: string | null = null
      let anilistIdRef: string | null = null
      let enrichedGenres: string[] = result.genres ?? []

      if (result.provider === 'comick') {
        const comickData = result.originalData as ComicKMedia
        comickHid = comickData.hid
        comickSlug = comickData.slug

        // Enrich with detail data for richer alt titles + anilistId + genres
        const enrichment = await enrichComicK(comickData.slug)
        if (enrichment) {
          comickHid = enrichment.hid
          anilistIdRef = enrichment.anilistId
          enrichedGenres = enrichment.genres.length > 0 ? enrichment.genres : enrichedGenres
          // Merge enriched alt titles into altTitles (deduplicated)
          const existingSet = new Set(altTitles.map((t) => t.toLowerCase().trim()))
          for (const t of enrichment.altTitles) {
            if (t && !existingSet.has(t.toLowerCase().trim())) {
              altTitles.push(t)
              existingSet.add(t.toLowerCase().trim())
            }
          }
        }
      }

      const item: TrackedItem = {
        provider: result.provider,
        providerId: result.id,
        mediaType: 'manga',
        format: result.format,
        titles: {
          main: result.title.primary,
          alt: altTitles,
        },
        coverImage: result.coverUrl,
        progress: {
          unit: 'chapter',
          value: meta.chapterNumber || '0',
        },
        lastUrl: meta.pageUrl,
        updatedAt: now,
        createdAt: now,
        // Chapter tracking fields
        chaptersWhenAdded: result.chapters,
        latestKnownChapters: result.chapters,
        lastApiCheck: now,
        notificationsEnabled: false, // Off by default per user decision
        anilistStatus: providerStatus,
        genres: enrichedGenres,
        tags: [],
        genresBackfilled: enrichedGenres.length > 0,
        comickHid,
        comickSlug,
        anilistId: anilistIdRef,
        pinned: false,
      }

      await saveItem(item)
      setState({ status: 'success', metadata: null, searchResults: null, error: null, originalExtractedTitle: null })
      onSuccess()

      // Reset after delay
      setTimeout(() => {
        setState({ status: 'idle', metadata: null, searchResults: null, error: null, originalExtractedTitle: null })
      }, TOAST_DURATION_MS)
    } catch (err) {
      log.error('add-item failed', { providerId: result.id, err: logErr(err) })
      setState((prev) => ({
        ...prev,
        status: 'error',
        error: friendlyError(err),
      }))
    }
  }

  const searchManually = async (query: string) => {
    if (!query.trim()) return

    setState((prev) => ({ ...prev, status: 'searching' }))

    try {
      const results = await searchManga(query, query)
      setState((prev) => ({ ...prev, status: 'selecting', searchResults: results }))
    } catch (err) {
      log.error('add-item search failed', { err: logErr(err) })
      setState((prev) => ({
        ...prev,
        status: 'error',
        error: friendlyError(err),
      }))
    }
  }

  const cancelSelection = () => {
    setState({ status: 'idle', metadata: null, searchResults: null, error: null, originalExtractedTitle: null })
  }

  const reset = () => {
    setState({ status: 'idle', metadata: null, searchResults: null, error: null, originalExtractedTitle: null })
  }

  return {
    ...state,
    startAdd,
    selectResult,
    searchManually,
    cancelSelection,
    reset,
  }
}
