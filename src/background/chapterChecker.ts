// Hourly chapter update checking logic

import { storageService } from '@/storage'
import { fetchBatchChapterInfo } from './anilist'
import { fetchBatchMangaDexInfo, searchMangaDex } from './mangadex'
import { fetchBatchComicKInfo, searchComicK } from './comick'
import type { ComicKChapterResult } from './comick'
import { showNewChaptersNotification, showBatchNotification } from './notifications'
import type { TrackedItem } from '@/shared/types'
import { CHAPTER_CHECK_ALARM_NAME, CHAPTER_CHECK_INITIAL_DELAY_MIN } from '@/shared/constants'
import { createLogger } from '@/shared/logger'
import { importActive } from './state'

const log = createLogger('chapters')

/**
 * Search MangaDex by title to get chapter info as fallback.
 * Returns the best match's lastChapter if found.
 */
async function getMangaDexChaptersByTitle(title: string): Promise<number | null> {
  try {
    const results = await searchMangaDex(title)
    if (results.length === 0) return null

    // Use first result (best match)
    const best = results[0]
    if (!best.lastChapter) return null

    const chapters = parseInt(best.lastChapter, 10)
    return isNaN(chapters) ? null : chapters
  } catch (err) {
    log.error('MangaDex fallback search failed for', title, ':', err)
    return null
  }
}

/**
 * Search ComicK by title to get chapter info as fallback.
 * Returns the first result's lastChapter if found.
 */
async function getComicKChaptersByTitle(title: string): Promise<number | null> {
  try {
    const results = await searchComicK(title)
    if (results.length === 0) return null

    const best = results[0]
    return best.lastChapter ?? null
  } catch (err) {
    log.error('ComicK fallback search failed for', title, ':', err)
    return null
  }
}

/**
 * Set up the alarm for periodic chapter checking.
 */
export async function setupChapterCheckAlarm(): Promise<void> {
  const settings = await storageService.getSettings()

  // Clear any existing alarm
  await chrome.alarms.clear(CHAPTER_CHECK_ALARM_NAME)

  // Create new alarm with the configured interval
  chrome.alarms.create(CHAPTER_CHECK_ALARM_NAME, {
    delayInMinutes: CHAPTER_CHECK_INITIAL_DELAY_MIN,
    periodInMinutes: settings.checkIntervalMinutes,
  })

  log.info(
    'Alarm set up with interval:',
    settings.checkIntervalMinutes,
    'minutes'
  )
}

/**
 * Handle the alarm event - check for chapter updates.
 */
export async function handleChapterCheckAlarm(): Promise<void> {
  if (importActive) {
    log.info('Skipping chapter check — CSV import is active')
    return
  }
  log.info('Running chapter check...')

  const settings = await storageService.getSettings()

  // Check global notifications toggle
  if (!settings.globalNotificationsEnabled) {
    log.debug('Global notifications disabled, skipping check')
    return
  }

  // Get items that need updating
  const items = await storageService.getItemsForUpdate()

  if (items.length === 0) {
    log.debug('No items to check')
    return
  }

  log.info('Checking', items.length, 'items')

  // Split items by provider — items with comickSlug always use ComicK
  const comickItems = items.filter((item) => item.comickSlug)
  const anilistOnly = items.filter((item) => !item.comickSlug && item.provider === 'anilist')
  const mangadexOnly = items.filter((item) => !item.comickSlug && item.provider === 'mangadex')

  // Fetch from all three APIs in parallel
  const comickSlugs = comickItems.map((item) => item.comickSlug as string)
  const anilistIds = anilistOnly.map((item) => item.providerId)
  const mangadexIds = mangadexOnly.map((item) => item.providerId)

  const [comickInfo, anilistInfo, mangadexInfo] = await Promise.all([
    comickSlugs.length > 0 ? fetchBatchComicKInfo(comickSlugs) : new Map<string, ComicKChapterResult>(),
    anilistIds.length > 0 ? fetchBatchChapterInfo(anilistIds) : new Map(),
    mangadexIds.length > 0 ? fetchBatchMangaDexInfo(mangadexIds) : new Map(),
  ])

  // Log fetched data
  if (comickInfo.size > 0) {
    log.debug('ComicK data:')
    for (const [slug, info] of comickInfo) {
      const item = comickItems.find((i) => i.comickSlug === slug)
      log.debug(`  - ${item?.titles.main || slug}: chapters=${info.chapters}, status=${info.status}`)
    }
  }

  if (anilistInfo.size > 0) {
    log.debug('AniList data:')
    for (const [id, info] of anilistInfo) {
      const item = anilistOnly.find((i) => i.providerId === id)
      log.debug(`  - ${item?.titles.main || id}: chapters=${info.chapters}, status=${info.status}`)
    }
  }

  if (mangadexInfo.size > 0) {
    log.debug('MangaDex data:')
    for (const [id, info] of mangadexInfo) {
      const item = mangadexOnly.find((i) => i.providerId === id)
      log.debug(`  - ${item?.titles.main || id}: chapters=${info.lastChapter}, status=${info.status}`)
    }
  }

  // Find AniList items with null chapters - try ComicK first, then MangaDex as last resort
  const anilistNullChapterItems = anilistOnly.filter((item) => {
    const info = anilistInfo.get(item.providerId)
    return info && info.chapters === null
  })

  // Fetch fallback for AniList items with null chapters (ComicK first, MangaDex second)
  const titleFallback = new Map<string, number | null>()
  if (anilistNullChapterItems.length > 0) {
    log.debug('Fetching fallback for', anilistNullChapterItems.length, 'items with null AniList chapters')

    const BATCH_SIZE = 5
    const BATCH_DELAY = 1100

    for (let i = 0; i < anilistNullChapterItems.length; i += BATCH_SIZE) {
      const batch = anilistNullChapterItems.slice(i, i + BATCH_SIZE)
      const batchResults = await Promise.allSettled(
        batch.map(async (item) => {
          const comickChapters = await getComicKChaptersByTitle(item.titles.main)
          if (comickChapters !== null) return comickChapters
          return getMangaDexChaptersByTitle(item.titles.main)
        })
      )

      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j]
        if (result.status === 'fulfilled') {
          titleFallback.set(batch[j].providerId, result.value)
          log.debug(`  - ${batch[j].titles.main}: fallback chapters=${result.value}`)
        }
      }

      if (i + BATCH_SIZE < anilistNullChapterItems.length) {
        await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY))
      }
    }
  }

  // Merge into common format: providerId -> { status, chapters, source }
  const chapterInfo = new Map<string, { status: string | null; chapters: number | null; source: string }>()
  const itemsWithNoData: TrackedItem[] = []

  // ComicK items — keyed by slug in comickInfo, map back to providerId
  for (const item of comickItems) {
    const slug = item.comickSlug as string
    const info = comickInfo.get(slug)
    if (!info) continue

    chapterInfo.set(item.providerId, { status: info.status, chapters: info.chapters, source: 'comick' })

    if (info.chapters === null) {
      itemsWithNoData.push(item)
    }
  }

  for (const [id, info] of anilistInfo) {
    let chapters = info.chapters
    let source = 'anilist'

    // Use ComicK/MangaDex fallback if AniList has null chapters
    if (chapters === null && titleFallback.has(id)) {
      chapters = titleFallback.get(id) ?? null
      source = chapters !== null ? 'fallback' : 'none'
    }

    chapterInfo.set(id, { status: info.status, chapters, source })

    // Track items with no data from either provider
    if (chapters === null) {
      const item = anilistOnly.find((i) => i.providerId === id)
      if (item) itemsWithNoData.push(item)
    }
  }

  for (const [id, info] of mangadexInfo) {
    const chapters = info.lastChapter
    chapterInfo.set(id, { status: info.status, chapters, source: 'mangadex' })

    // Track items with no data
    if (chapters === null) {
      const item = mangadexOnly.find((i) => i.providerId === id)
      if (item) itemsWithNoData.push(item)
    }
  }

  // Log items with no chapter data from any provider
  if (itemsWithNoData.length > 0) {
    log.debug('No chapter data available from any provider for:')
    for (const item of itemsWithNoData) {
      log.debug(`  - ${item.titles.main} (${item.provider})`)
    }
  }

  // Process updates and collect notifications
  const updates: Array<{
    providerId: string
    latestKnownChapters: number | null
    anilistStatus: string | null
    lastApiCheck: number
  }> = []

  const itemsWithNewChapters: Array<{
    title: string
    chaptersAhead: number
    coverImage: string
    providerId: string
  }> = []

  const now = Date.now()

  for (const item of items) {
    const info = chapterInfo.get(item.providerId)

    if (!info) {
      log.debug('No info found for', item.titles.main, '(provider:', item.provider, ')')
      continue
    }

    const previousChapters = item.latestKnownChapters
    const newChapters = info.chapters

    // Always update the tracking info
    updates.push({
      providerId: item.providerId,
      latestKnownChapters: newChapters,
      anilistStatus: info.status,
      lastApiCheck: now,
    })

    // Check if we should notify
    if (newChapters !== null && previousChapters !== null && newChapters > previousChapters) {
      // Smart filter: only notify if new chapters are beyond what user started with
      const chaptersWhenAdded = item.chaptersWhenAdded ?? 0

      if (settings.notifyOnlyNewReleases && newChapters <= chaptersWhenAdded) {
        log.debug(
          'Skipping notification for',
          item.titles.main,
          '- chapters not beyond baseline'
        )
        continue
      }

      const chaptersAhead = newChapters - (previousChapters ?? 0)

      log.info(
        'New chapters for',
        item.titles.main,
        ':',
        previousChapters,
        '->',
        newChapters
      )

      itemsWithNewChapters.push({
        title: item.titles.main,
        chaptersAhead,
        coverImage: item.coverImage,
        providerId: item.providerId,
      })
    }
  }

  // Save all updates
  if (updates.length > 0) {
    await storageService.bulkUpdateChapterInfo(updates)
    log.debug('Updated chapter info for', updates.length, 'items')
  }

  // Send notifications
  if (itemsWithNewChapters.length === 1) {
    // Single item - show detailed notification
    const item = itemsWithNewChapters[0]
    await showNewChaptersNotification({
      title: item.title,
      chaptersAhead: item.chaptersAhead,
      coverImage: item.coverImage,
      providerId: item.providerId,
    })
  } else if (itemsWithNewChapters.length > 1) {
    // Multiple items - show summary notification
    await showBatchNotification(itemsWithNewChapters.length)
  }

  log.info('Check complete')
}

/**
 * Manually trigger a chapter check (for testing or user-initiated refresh).
 */
export async function triggerManualCheck(): Promise<void> {
  await handleChapterCheckAlarm()
}
