// Hourly chapter update checking logic

import { storageService } from '@/storage'
import { fetchBatchChapterInfo } from './anilist'
import { fetchBatchMangaDexInfo, searchMangaDex } from './mangadex'
import { showNewChaptersNotification, showBatchNotification } from './notifications'
import type { TrackedItem } from '@/shared/types'

const ALARM_NAME = 'checkpoint-chapter-check'

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
    console.error('[chapterChecker] MangaDex fallback search failed for', title, ':', err)
    return null
  }
}

/**
 * Set up the alarm for periodic chapter checking.
 */
export async function setupChapterCheckAlarm(): Promise<void> {
  const settings = await storageService.getSettings()

  // Clear any existing alarm
  await chrome.alarms.clear(ALARM_NAME)

  // Create new alarm with the configured interval
  chrome.alarms.create(ALARM_NAME, {
    delayInMinutes: 1, // First check 1 minute after extension loads
    periodInMinutes: settings.checkIntervalMinutes,
  })

  console.log(
    '[chapterChecker] Alarm set up with interval:',
    settings.checkIntervalMinutes,
    'minutes'
  )
}

/**
 * Handle the alarm event - check for chapter updates.
 */
export async function handleChapterCheckAlarm(): Promise<void> {
  console.log('[chapterChecker] Running chapter check...')

  const settings = await storageService.getSettings()

  // Check global notifications toggle
  if (!settings.globalNotificationsEnabled) {
    console.log('[chapterChecker] Global notifications disabled, skipping check')
    return
  }

  // Get items that need updating
  const items = await storageService.getItemsForUpdate()

  if (items.length === 0) {
    console.log('[chapterChecker] No items to check')
    return
  }

  console.log('[chapterChecker] Checking', items.length, 'items')

  // Split items by provider
  const anilistItems = items.filter((item) => item.provider === 'anilist')
  const mangadexItems = items.filter((item) => item.provider === 'mangadex')

  // Fetch from both APIs
  const anilistIds = anilistItems.map((item) => item.providerId)
  const mangadexIds = mangadexItems.map((item) => item.providerId)

  const [anilistInfo, mangadexInfo] = await Promise.all([
    anilistIds.length > 0 ? fetchBatchChapterInfo(anilistIds) : new Map(),
    mangadexIds.length > 0 ? fetchBatchMangaDexInfo(mangadexIds) : new Map(),
  ])

  // Log fetched data
  if (anilistInfo.size > 0) {
    console.log('[chapterChecker] AniList data:')
    for (const [id, info] of anilistInfo) {
      const item = anilistItems.find((i) => i.providerId === id)
      console.log(`  - ${item?.titles.main || id}: chapters=${info.chapters}, status=${info.status}`)
    }
  }

  if (mangadexInfo.size > 0) {
    console.log('[chapterChecker] MangaDex data:')
    for (const [id, info] of mangadexInfo) {
      const item = mangadexItems.find((i) => i.providerId === id)
      console.log(`  - ${item?.titles.main || id}: chapters=${info.lastChapter}, status=${info.status}`)
    }
  }

  // Find AniList items with null chapters - need MangaDex fallback
  const anilistNullChapterItems = anilistItems.filter((item) => {
    const info = anilistInfo.get(item.providerId)
    return info && info.chapters === null
  })

  // Fetch MangaDex fallback for AniList items with null chapters
  const mangadexFallback = new Map<string, number | null>()
  if (anilistNullChapterItems.length > 0) {
    console.log('[chapterChecker] Fetching MangaDex fallback for', anilistNullChapterItems.length, 'items with null AniList chapters')

    for (const item of anilistNullChapterItems) {
      const chapters = await getMangaDexChaptersByTitle(item.titles.main)
      mangadexFallback.set(item.providerId, chapters)
      console.log(`  - ${item.titles.main}: MangaDex fallback chapters=${chapters}`)

      // Small delay between searches
      if (anilistNullChapterItems.length > 1) {
        await new Promise((resolve) => setTimeout(resolve, 250))
      }
    }
  }

  // Merge into common format: providerId -> { status, chapters, source }
  const chapterInfo = new Map<string, { status: string | null; chapters: number | null; source: string }>()
  const itemsWithNoData: TrackedItem[] = []

  for (const [id, info] of anilistInfo) {
    let chapters = info.chapters
    let source = 'anilist'

    // Use MangaDex fallback if AniList has null chapters
    if (chapters === null && mangadexFallback.has(id)) {
      chapters = mangadexFallback.get(id) ?? null
      source = chapters !== null ? 'mangadex-fallback' : 'none'
    }

    chapterInfo.set(id, { status: info.status, chapters, source })

    // Track items with no data from either provider
    if (chapters === null) {
      const item = anilistItems.find((i) => i.providerId === id)
      if (item) itemsWithNoData.push(item)
    }
  }

  for (const [id, info] of mangadexInfo) {
    const chapters = info.lastChapter
    chapterInfo.set(id, { status: info.status, chapters, source: 'mangadex' })

    // Track items with no data
    if (chapters === null) {
      const item = mangadexItems.find((i) => i.providerId === id)
      if (item) itemsWithNoData.push(item)
    }
  }

  // Log items with no chapter data from any provider
  if (itemsWithNoData.length > 0) {
    console.log('[chapterChecker] No chapter data available from any provider for:')
    for (const item of itemsWithNoData) {
      console.log(`  - ${item.titles.main} (${item.provider})`)
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
      console.log('[chapterChecker] No info found for', item.titles.main, '(provider:', item.provider, ')')
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
        console.log(
          '[chapterChecker] Skipping notification for',
          item.titles.main,
          '- chapters not beyond baseline'
        )
        continue
      }

      const chaptersAhead = newChapters - (previousChapters ?? 0)

      console.log(
        '[chapterChecker] New chapters for',
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
    console.log('[chapterChecker] Updated chapter info for', updates.length, 'items')
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

  console.log('[chapterChecker] Check complete')
}

/**
 * Manually trigger a chapter check (for testing or user-initiated refresh).
 */
export async function triggerManualCheck(): Promise<void> {
  await handleChapterCheckAlarm()
}
