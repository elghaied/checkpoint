import { storageService } from '@/storage'
import { fetchBatchChapterInfo, searchAniList } from './anilist'
import { searchMangaDex } from './mangadex'
import { fetchComicDetail, searchComicK } from './comick'
import { createLogger } from '@/shared/logger'
import { BACKFILL_BATCH_SIZE, BACKFILL_BATCH_DELAY_MS } from '@/shared/constants'
import type { TrackedItem } from '@/shared/types'

const log = createLogger('genreBackfill')

/**
 * Fetch genres for an item using ComicK-first fallback logic.
 * Tries ComicK detail (if slug available), then ComicK search by title,
 * then the opposite provider (MangaDex for AniList/ComicK items, AniList for MangaDex items).
 */
async function fetchFallbackGenres(item: TrackedItem): Promise<string[]> {
  // Try ComicK first (best genre data)
  if (item.comickSlug) {
    try {
      const detail = await fetchComicDetail(item.comickSlug)
      if (detail && detail.genres.length > 0) return detail.genres
    } catch (err) {
      log.error('ComicK detail fallback failed for', item.titles.main, ':', err)
    }
  }

  // Try ComicK search by title
  try {
    const results = await searchComicK(item.titles.main)
    if (results.length > 0) {
      const detail = await fetchComicDetail(results[0].slug)
      if (detail && detail.genres.length > 0) return detail.genres
    }
  } catch {
    // ComicK unavailable, continue to other providers
  }

  if (item.provider === 'anilist' || item.provider === 'comick') {
    try {
      const results = await searchMangaDex(item.titles.main)
      if (results.length > 0 && results[0].genres.length > 0) return results[0].genres
    } catch (err) {
      log.error('MangaDex fallback failed for', item.titles.main, ':', err)
    }
  }

  if (item.provider === 'mangadex') {
    try {
      const results = await searchAniList(item.titles.main)
      if (results.length > 0 && results[0].genres.length > 0) return results[0].genres
    } catch (err) {
      log.error('AniList fallback failed for', item.titles.main, ':', err)
    }
  }

  return []
}

/**
 * Run genre backfill for all tracked items that have not yet been backfilled.
 *
 * - AniList items: batch fetched via fetchBatchChapterInfo (up to 50 IDs at a time)
 * - MangaDex items: searched by title in batches of BACKFILL_BATCH_SIZE with
 *   BACKFILL_BATCH_DELAY_MS between batches
 * - If the primary provider returns empty genres, the other provider is tried
 * - Each item is marked genresBackfilled=true regardless of whether genres were found
 * - Progress is reported via storageService.writeBackfillProgress throughout
 */
export async function runGenreBackfill(): Promise<void> {
  log.info('Starting genre backfill')

  const allItems = await storageService.getAll()
  const pendingItems = allItems.filter((item) => item.genresBackfilled !== true)

  if (pendingItems.length === 0) {
    log.info('All items already backfilled')
    await storageService.writeBackfillProgress({ completed: 0, total: 0, status: 'done' })
    return
  }

  log.info('Backfilling genres for', pendingItems.length, 'items')

  await storageService.writeBackfillProgress({
    completed: 0,
    total: pendingItems.length,
    status: 'running',
  })

  let completed = 0

  // Split by provider
  const anilistItems = pendingItems.filter((item) => item.provider === 'anilist')
  const mangadexItems = pendingItems.filter((item) => item.provider === 'mangadex')
  const comickItems = pendingItems.filter((item) => item.provider === 'comick')

  // -----------------------------------------------------------------------
  // Process AniList items
  // -----------------------------------------------------------------------

  if (anilistItems.length > 0) {
    // Fetch in batches of up to BATCH_FETCH_PAGE_SIZE (50) — reuse the same
    // batch endpoint used for chapter checking, which now also returns genres.
    const ids = anilistItems.map((item) => item.providerId)
    let batchInfo: Map<string, { id: string; status: string | null; chapters: number | null; genres: string[] }>

    try {
      batchInfo = await fetchBatchChapterInfo(ids)
    } catch (err) {
      log.error('fetchBatchChapterInfo failed during backfill:', err)
      batchInfo = new Map()
    }

    for (const item of anilistItems) {
      const info = batchInfo.get(item.providerId)
      let genres = info?.genres ?? []

      // If AniList returned empty genres, try MangaDex as fallback
      if (genres.length === 0) {
        genres = await fetchFallbackGenres(item)
      }

      await storageService.update(item.providerId, { genres, genresBackfilled: true })

      completed++
      await storageService.writeBackfillProgress({
        completed,
        total: pendingItems.length,
        status: 'running',
      })

      log.debug('Backfilled', item.titles.main, ':', genres)
    }
  }

  // -----------------------------------------------------------------------
  // Process ComicK items (batched with rate limiting)
  // -----------------------------------------------------------------------

  for (let i = 0; i < comickItems.length; i += BACKFILL_BATCH_SIZE) {
    const batch = comickItems.slice(i, i + BACKFILL_BATCH_SIZE)

    for (const item of batch) {
      let genres: string[] = []

      if (item.comickSlug) {
        try {
          const detail = await fetchComicDetail(item.comickSlug)
          if (detail && detail.genres.length > 0) {
            genres = detail.genres
          }
        } catch (err) {
          log.error('ComicK detail fetch failed for', item.titles.main, ':', err)
        }
      }

      if (genres.length === 0) {
        genres = await fetchFallbackGenres(item)
      }

      await storageService.update(item.providerId, { genres, genresBackfilled: true })

      completed++
      await storageService.writeBackfillProgress({
        completed,
        total: pendingItems.length,
        status: 'running',
      })

      log.debug('Backfilled', item.titles.main, ':', genres)
    }

    // Rate limit: delay between batches (skip after last batch)
    if (i + BACKFILL_BATCH_SIZE < comickItems.length) {
      await new Promise((resolve) => setTimeout(resolve, BACKFILL_BATCH_DELAY_MS))
    }
  }

  // -----------------------------------------------------------------------
  // Process MangaDex items (batched with rate limiting)
  // -----------------------------------------------------------------------

  for (let i = 0; i < mangadexItems.length; i += BACKFILL_BATCH_SIZE) {
    const batch = mangadexItems.slice(i, i + BACKFILL_BATCH_SIZE)

    for (const item of batch) {
      let genres: string[] = []

      try {
        const results = await searchMangaDex(item.titles.main)
        // Match by providerId to ensure we're using the right entry
        const match = results.find((r) => r.id === item.providerId)

        if (match && match.genres.length > 0) {
          genres = match.genres
        } else if (genres.length === 0) {
          // Primary provider gave nothing — try AniList as fallback
          genres = await fetchFallbackGenres(item)
        }
      } catch (err) {
        log.error('MangaDex search failed for', item.titles.main, ':', err)
        // Try AniList fallback on error
        genres = await fetchFallbackGenres(item)
      }

      await storageService.update(item.providerId, { genres, genresBackfilled: true })

      completed++
      await storageService.writeBackfillProgress({
        completed,
        total: pendingItems.length,
        status: 'running',
      })

      log.debug('Backfilled', item.titles.main, ':', genres)
    }

    // Rate limit: delay between batches (skip after last batch)
    if (i + BACKFILL_BATCH_SIZE < mangadexItems.length) {
      await new Promise((resolve) => setTimeout(resolve, BACKFILL_BATCH_DELAY_MS))
    }
  }

  await storageService.writeBackfillProgress({
    completed,
    total: pendingItems.length,
    status: 'done',
  })

  log.info('Genre backfill complete:', completed, '/', pendingItems.length)
}
