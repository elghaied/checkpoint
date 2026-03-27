import { storageService } from '@/storage'
import { searchComicK, fetchComicDetail } from './comick'
import { normalise, scorePair } from './anilist'
import { createLogger } from '@/shared/logger'
import {
  MIGRATION_CONFIDENCE_THRESHOLD,
  MIGRATION_STORAGE_KEY,
  COMICK_RATE_LIMIT_DELAY_MS,
} from '@/shared/constants'
import type { TrackedItem } from '@/shared/types'
import type { ComicKDetail } from './comick'

const log = createLogger('migration')

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MigrationResult {
  migrated: number
  skipped: number
  items: TrackedItem[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Score a ComicK result's title against the tracked item's main title.
 * Checks main title + all alt titles on the ComicK result.
 */
function scoreComicKResult(
  itemTitle: string,
  comickTitle: string,
  comickAltTitles: string[]
): number {
  const normItem = normalise(itemTitle)
  const allTitles = [comickTitle, ...comickAltTitles]
  let best = 0

  for (const t of allTitles) {
    const score = scorePair(normItem, normalise(t))
    if (score > best) best = score
  }

  return best
}

// ---------------------------------------------------------------------------
// migrateItemsToComicK
// ---------------------------------------------------------------------------

/**
 * For each item without a comickSlug, attempt to find a ComicK cross-reference.
 *
 * Strategy:
 * 1. Search ComicK by item title
 * 2. Score results using normalise/scorePair
 * 3. For AniList items: fetch detail and check if links.al matches providerId
 *    (ID match → confidence 1.0)
 * 4. If confidence >= MIGRATION_CONFIDENCE_THRESHOLD: update item with
 *    comickHid, comickSlug, anilistId, genres (if better), latestKnownChapters
 * 5. Rate limit between items
 *
 * IMPORTANT: Does NOT change provider or providerId.
 */
export async function migrateItemsToComicK(items: TrackedItem[]): Promise<MigrationResult> {
  let migrated = 0
  let skipped = 0
  const resultItems: TrackedItem[] = []

  for (let i = 0; i < items.length; i++) {
    const item = items[i]

    // Skip items that already have a ComicK cross-reference
    if (item.comickSlug) {
      skipped++
      resultItems.push(item)
      continue
    }

    try {
      // Search ComicK by title
      const searchResults = await searchComicK(item.titles.main)

      if (searchResults.length === 0) {
        log.debug('No ComicK results for:', item.titles.main)
        skipped++
        resultItems.push(item)
        continue
      }

      // Find the best-scoring result
      let bestScore = 0
      let bestIndex = 0

      for (let j = 0; j < searchResults.length; j++) {
        const r = searchResults[j]
        const score = scoreComicKResult(item.titles.main, r.title, r.altTitles)
        if (score > bestScore) {
          bestScore = score
          bestIndex = j
        }
      }

      const bestResult = searchResults[bestIndex]
      let finalConfidence = bestScore

      // For AniList items: fetch detail and check if links.al matches providerId
      // An ID match boosts confidence to 1.0
      let detail: ComicKDetail | null = null

      if (item.provider === 'anilist' && bestScore > 0) {
        detail = await fetchComicDetail(bestResult.slug)

        if (detail && detail.links.anilistId === item.providerId) {
          finalConfidence = 1.0
          log.debug('AniList ID match for:', item.titles.main)
        }
      }

      // Check if confidence meets the migration threshold
      if (finalConfidence < MIGRATION_CONFIDENCE_THRESHOLD) {
        log.debug(
          'Low confidence for:',
          item.titles.main,
          '– score:',
          finalConfidence,
          '– skipping'
        )
        skipped++
        resultItems.push(item)
        continue
      }

      // Fetch detail if we haven't already
      if (!detail) {
        detail = await fetchComicDetail(bestResult.slug)
      }

      if (!detail) {
        log.error('Failed to fetch ComicK detail for slug:', bestResult.slug)
        skipped++
        resultItems.push(item)
        continue
      }

      // Build the updated item (preserving all original fields)
      const updatedItem: TrackedItem = {
        ...item,
        comickHid: detail.hid,
        comickSlug: detail.slug,
        anilistId: detail.links.anilistId,
        // Use ComicK genres if item has none
        genres: item.genres.length === 0 && detail.genres.length > 0 ? detail.genres : item.genres,
        // Update chapter count from ComicK if it has a better value
        latestKnownChapters:
          detail.lastChapter !== null &&
          (item.latestKnownChapters === null || detail.lastChapter > item.latestKnownChapters)
            ? detail.lastChapter
            : item.latestKnownChapters,
      }

      migrated++
      resultItems.push(updatedItem)

      log.debug(
        'Migrated:',
        item.titles.main,
        '→',
        detail.slug,
        '(confidence:',
        finalConfidence,
        ')'
      )
    } catch (err) {
      log.error('Migration failed for:', item.titles.main, '–', err)
      skipped++
      resultItems.push(item)
    }

    // Rate limit between items (skip after last)
    if (i < items.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, COMICK_RATE_LIMIT_DELAY_MS))
    }
  }

  return { migrated, skipped, items: resultItems }
}

// ---------------------------------------------------------------------------
// runSilentMigration
// ---------------------------------------------------------------------------

/**
 * Wrapper that reads items from storage, runs migration for items without
 * comickSlug, saves results, and sets the migration complete flag.
 *
 * - Idempotent: exits immediately if MIGRATION_STORAGE_KEY is already set
 * - Non-destructive: only adds cross-reference fields, never changes provider/providerId
 */
export async function runSilentMigration(): Promise<void> {
  // Check if migration has already run
  const flagResult = await new Promise<Record<string, unknown>>((resolve) => {
    chrome.storage.local.get(MIGRATION_STORAGE_KEY, (result) => resolve(result))
  })

  if (flagResult[MIGRATION_STORAGE_KEY]) {
    log.debug('ComicK migration already complete – skipping')
    return
  }

  log.info('Starting silent ComicK migration')

  const allItems = await storageService.getAll()
  const pendingItems = allItems.filter((item) => !item.comickSlug)

  if (pendingItems.length === 0) {
    log.info('No items need ComicK migration')
    await new Promise<void>((resolve) => {
      chrome.storage.local.set({ [MIGRATION_STORAGE_KEY]: true }, resolve)
    })
    return
  }

  log.info('Migrating', pendingItems.length, 'items to ComicK cross-references')

  const result = await migrateItemsToComicK(pendingItems)

  // Save all migrated items back to storage
  for (const item of result.items) {
    if (item.comickSlug) {
      // Only save items that were actually migrated
      await storageService.update(item.providerId, {
        comickHid: item.comickHid,
        comickSlug: item.comickSlug,
        anilistId: item.anilistId,
        genres: item.genres,
        latestKnownChapters: item.latestKnownChapters,
      })
    }
  }

  // Set the migration complete flag
  await new Promise<void>((resolve) => {
    chrome.storage.local.set({ [MIGRATION_STORAGE_KEY]: true }, resolve)
  })

  log.info(
    'ComicK migration complete:',
    result.migrated,
    'migrated,',
    result.skipped,
    'skipped'
  )
}
