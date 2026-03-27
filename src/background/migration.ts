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

    log.warn(`[${i + 1}/${items.length}] Processing: "${item.titles.main}" (${item.provider}:${item.providerId})`)

    // Skip items that already have a ComicK cross-reference
    if (item.comickSlug) {
      log.warn(`  → Skipping: already has ComicK slug (${item.comickSlug})`)
      skipped++
      resultItems.push(item)
      continue
    }

    try {
      // Try searching with main title first, then alt titles if no good match
      const searchQueries = [item.titles.main, ...item.titles.alt.filter(Boolean)]
      let searchResults: Awaited<ReturnType<typeof searchComicK>> = []
      let bestScore = 0
      let bestIndex = 0
      let usedQuery = item.titles.main

      for (const query of searchQueries) {
        const results = await searchComicK(query)

        if (results.length === 0) continue

        // Score all results from this query
        for (let j = 0; j < results.length; j++) {
          const r = results[j]
          const score = scoreComicKResult(item.titles.main, r.title, r.altTitles)
          if (score > bestScore) {
            bestScore = score
            bestIndex = searchResults.length + j
            usedQuery = query
          }
        }

        searchResults = [...searchResults, ...results]

        // Stop trying alt titles if we found a good match
        if (bestScore >= MIGRATION_CONFIDENCE_THRESHOLD) break
      }

      if (searchResults.length === 0) {
        log.warn(`  → Skipping: no ComicK search results (tried ${searchQueries.length} queries)`)
        skipped++
        resultItems.push(item)
        continue
      }

      log.warn(`  Search returned ${searchResults.length} results (query: "${usedQuery}"):`, searchResults.slice(0, 5).map((r) => r.title).join(', '))

      for (const r of searchResults.slice(0, 5)) {
        const score = scoreComicKResult(item.titles.main, r.title, r.altTitles)
        log.warn(`    Score ${score.toFixed(3)} for "${r.title}" (slug: ${r.slug})`)
      }

      const bestResult = searchResults[bestIndex]
      log.warn(`  Best match: "${bestResult.title}" (slug: ${bestResult.slug}) — raw score: ${bestScore.toFixed(3)}`)
      let finalConfidence = bestScore

      // For AniList items: fetch detail and check if links.al matches providerId
      // An ID match boosts confidence to 1.0
      let detail: ComicKDetail | null = null

      if (item.provider === 'anilist' && bestScore > 0) {
        detail = await fetchComicDetail(bestResult.slug)

        if (detail && detail.links.anilistId === item.providerId) {
          finalConfidence = 1.0
          log.warn(`  AniList ID match (al:${detail.links.anilistId}) → boosting confidence to 1.0`)
        } else if (detail) {
          log.warn(`  AniList ID check: ComicK al=${detail.links.anilistId ?? 'null'}, item=${item.providerId} — no match`)
        }
      }

      // Check if confidence meets the migration threshold
      if (finalConfidence < MIGRATION_CONFIDENCE_THRESHOLD) {
        log.warn(
          `  → Skipping: confidence ${finalConfidence.toFixed(3)} < threshold ${MIGRATION_CONFIDENCE_THRESHOLD} for "${bestResult.title}"`
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
        log.error(`  → Skipping: failed to fetch ComicK detail for slug: ${bestResult.slug}`)
        skipped++
        resultItems.push(item)
        continue
      }

      // Merge alt titles: keep existing + add ComicK titles that aren't duplicates
      const existingAlts = new Set(item.titles.alt.map((t) => t.toLowerCase().trim()))
      const newAlts = detail.altTitles.filter((t) => !existingAlts.has(t.toLowerCase().trim()))
      const mergedAltTitles = [...item.titles.alt, ...newAlts]

      // Build the updated item (preserving all original fields)
      const updatedItem: TrackedItem = {
        ...item,
        comickHid: detail.hid,
        comickSlug: detail.slug,
        anilistId: detail.links.anilistId ?? null,
        titles: { main: item.titles.main, alt: mergedAltTitles },
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

      log.warn(
        `  → Migrated: "${item.titles.main}" → slug="${detail.slug}" hid="${detail.hid}" confidence=${finalConfidence.toFixed(3)} chapters=${detail.lastChapter ?? 'null'}`
      )
    } catch (err) {
      log.error(`  → Error: migration failed for "${item.titles.main}" —`, err)
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

  log.warn('Starting silent ComicK migration')

  const allItems = await storageService.getAll()
  const pendingItems = allItems.filter((item) => !item.comickSlug)

  if (pendingItems.length === 0) {
    log.warn('No items need ComicK migration')
    await new Promise<void>((resolve) => {
      chrome.storage.local.set({ [MIGRATION_STORAGE_KEY]: true }, resolve)
    })
    return
  }

  log.warn('Migrating', pendingItems.length, 'items to ComicK cross-references')

  const result = await migrateItemsToComicK(pendingItems)

  // Save all migrated items back to storage
  for (const item of result.items) {
    if (item.comickSlug) {
      // Only save items that were actually migrated
      await storageService.update(item.providerId, {
        comickHid: item.comickHid,
        comickSlug: item.comickSlug,
        anilistId: item.anilistId,
        titles: item.titles,
        genres: item.genres,
        latestKnownChapters: item.latestKnownChapters,
      })
    }
  }

  // Set the migration complete flag
  await new Promise<void>((resolve) => {
    chrome.storage.local.set({ [MIGRATION_STORAGE_KEY]: true }, resolve)
  })

  log.warn(
    'ComicK migration complete:',
    result.migrated,
    'migrated,',
    result.skipped,
    'skipped'
  )
}
