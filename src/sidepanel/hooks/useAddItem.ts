import { useState } from 'react'
import type { TrackedItem, AniListMedia, PageMetadata } from '@/shared/types'
import { extractMetadata, searchAniList, saveItem, findByTitle } from '../services/messaging'
import { getFormat } from '@/shared/utils'

interface AddItemState {
  status: 'idle' | 'extracting' | 'searching' | 'selecting' | 'saving' | 'success' | 'error'
  metadata: PageMetadata | null
  searchResults: AniListMedia[] | null
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

      // Search AniList
      const results = await searchAniList(query)

      if (results.length === 0) {
        setState((prev) => ({ ...prev, status: 'selecting', searchResults: [] }))
        return
      }

      if (results.length === 1) {
        // Auto-select single result
        await selectMedia(results[0], metadata)
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

  const selectMedia = async (media: AniListMedia, metadata?: PageMetadata) => {
    const meta = metadata || state.metadata
    if (!meta) return

    setState((prev) => ({ ...prev, status: 'saving' }))

    try {
      const now = Date.now()
      const altTitles = [
        media.title.romaji,
        media.title.native,
        ...(media.title.english ? [media.title.english] : []),
        ...media.synonyms,
      ].filter(Boolean)

      // Include the original extracted title in alt names if it's different
      const originalTitle = state.originalExtractedTitle
      if (originalTitle && !altTitles.some((t) => t.toLowerCase().trim() === originalTitle.toLowerCase().trim())) {
        altTitles.push(originalTitle)
      }

      const item: TrackedItem = {
        provider: 'anilist',
        providerId: String(media.id),
        mediaType: 'manga',
        format: getFormat(media.countryOfOrigin),
        titles: {
          main: media.title.english || media.title.romaji,
          alt: altTitles,
        },
        coverImage: media.coverImage.large || media.coverImage.medium,
        progress: {
          unit: 'chapter',
          value: meta.chapterNumber || '0',
        },
        lastUrl: meta.pageUrl,
        updatedAt: now,
        createdAt: now,
        // Chapter tracking fields
        chaptersWhenAdded: media.chapters,
        latestKnownChapters: media.chapters,
        lastApiCheck: now,
        notificationsEnabled: false, // Off by default per user decision
        anilistStatus: media.status,
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

  const searchManually = async (query: string) => {
    if (!query.trim()) return

    setState((prev) => ({ ...prev, status: 'searching' }))

    try {
      const results = await searchAniList(query)
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
    searchManually,
    cancelSelection,
    reset,
  }
}
