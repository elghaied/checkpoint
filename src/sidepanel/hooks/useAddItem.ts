import { useState } from 'react'
import type { TrackedItem, AniListMedia, PageMetadata, UnifiedSearchResult } from '@/shared/types'
import { extractMetadata, searchManga, saveItem, findByTitle } from '../services/messaging'

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
      const metadata = await extractMetadata()
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
        }, 2000)
        return
      }

      // Search with fallback (AniList → MangaDex)
      const results = await searchManga(query, query)

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
      setState((prev) => ({
        ...prev,
        status: 'error',
        error: err instanceof Error ? err.message : 'Failed to add item',
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

      // Extract provider-specific data
      let anilistStatus: string | null = null
      if (result.provider === 'anilist') {
        const anilistData = result.originalData as AniListMedia
        anilistStatus = anilistData.status
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
        anilistStatus,
      }

      await saveItem(item)
      setState({ status: 'success', metadata: null, searchResults: null, error: null, originalExtractedTitle: null })
      onSuccess()

      // Reset after delay
      setTimeout(() => {
        setState({ status: 'idle', metadata: null, searchResults: null, error: null, originalExtractedTitle: null })
      }, 2000)
    } catch (err) {
      setState((prev) => ({
        ...prev,
        status: 'error',
        error: err instanceof Error ? err.message : 'Failed to save item',
      }))
    }
  }

  // Legacy function for backwards compatibility (wraps UnifiedSearchResult)
  const selectMedia = async (media: AniListMedia, metadata?: PageMetadata) => {
    // Convert AniListMedia to UnifiedSearchResult format
    const result: UnifiedSearchResult = {
      provider: 'anilist',
      id: String(media.id),
      title: {
        primary: media.title.english || media.title.romaji,
        alt: [
          media.title.romaji,
          media.title.native,
          ...(media.title.english ? [media.title.english] : []),
          ...media.synonyms,
        ].filter(Boolean),
      },
      coverUrl: media.coverImage.large || media.coverImage.medium,
      format: media.countryOfOrigin === 'KR' ? 'MANHWA' : media.countryOfOrigin === 'CN' || media.countryOfOrigin === 'TW' ? 'MANHUA' : 'MANGA',
      status: media.status,
      chapters: media.chapters,
      confidence: 1,
      originalData: media,
    }
    return selectResult(result, metadata)
  }

  const searchManually = async (query: string) => {
    if (!query.trim()) return

    setState((prev) => ({ ...prev, status: 'searching' }))

    try {
      const results = await searchManga(query, query)
      setState((prev) => ({ ...prev, status: 'selecting', searchResults: results }))
    } catch (err) {
      setState((prev) => ({
        ...prev,
        status: 'error',
        error: err instanceof Error ? err.message : 'Search failed',
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
    selectMedia,
    selectResult,
    searchManually,
    cancelSelection,
    reset,
  }
}
