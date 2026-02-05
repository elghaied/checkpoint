// Hourly chapter update checking logic

import { storageService } from '@/storage'
import { fetchBatchChapterInfo } from './anilist'
import { showNewChaptersNotification, showBatchNotification } from './notifications'

const ALARM_NAME = 'checkpoint-chapter-check'

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

  // Fetch latest chapter info from AniList
  const providerIds = items.map((item) => item.providerId)
  const chapterInfo = await fetchBatchChapterInfo(providerIds)

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
      console.log('[chapterChecker] No info found for', item.titles.main)
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
