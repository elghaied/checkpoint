// Checkpoint Background Service Worker
import { searchAniList } from './anilist'
import { searchMangaDex } from './mangadex'
import { searchWithFallback } from './searchService'
import { storageService } from '@/storage'
import { setupChapterCheckAlarm, handleChapterCheckAlarm, triggerManualCheck } from './chapterChecker'
import type { MessageRequest, ExportedData } from '@/shared/types'
import { CHAPTER_CHECK_ALARM_NAME, CONTENT_SCRIPT_MAX_RETRIES, CONTENT_SCRIPT_RETRY_DELAY_MS } from '@/shared/constants'
import { createLogger } from '@/shared/logger'

const log = createLogger('background')

log.info('Checkpoint service worker started')

// Set up side panel behavior
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })

// Set up chapter check alarm
setupChapterCheckAlarm()

// Listen for alarm events
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === CHAPTER_CHECK_ALARM_NAME) {
    handleChapterCheckAlarm()
  }
})

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  log.debug('Received message:', message.type)

  // Handle messages asynchronously
  handleMessage(message as MessageRequest, sender)
    .then((result) => sendResponse({ data: result }))
    .catch((error) => {
      log.error('Message handler error:', error)
      sendResponse({ error: error.message })
    })

  // Return true to indicate async response
  return true
})

async function handleMessage(
  message: MessageRequest,
  sender: chrome.runtime.MessageSender
): Promise<unknown> {
  switch (message.type) {
    case 'EXTRACT_METADATA': {
      let tabId = message.tabId ?? sender.tab?.id

      // If no tab ID, query for the active tab in the current window
      if (!tabId) {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true })
        tabId = activeTab?.id
      }

      if (!tabId) {
        throw new Error('No active tab found')
      }

      // Ensure the content script is injected
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['content/index.js'],
        })
      } catch {
        // Script may already be injected, continue
      }

      // Retry sending message — content script listener may not be ready immediately after injection
      for (let attempt = 0; attempt < CONTENT_SCRIPT_MAX_RETRIES; attempt++) {
        try {
          return await chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_METADATA' })
        } catch (err) {
          if (attempt < CONTENT_SCRIPT_MAX_RETRIES - 1) {
            await new Promise((resolve) => setTimeout(resolve, CONTENT_SCRIPT_RETRY_DELAY_MS))
          } else {
            throw err
          }
        }
      }
      throw new Error('Failed to extract metadata after retries')
    }

    case 'SEARCH_ANILIST': {
      log.debug('SEARCH_ANILIST:', message.query)
      const results = await searchAniList(message.query)
      log.debug('SEARCH_ANILIST results:', results.length)
      return results
    }

    case 'SEARCH_MANGA': {
      log.debug('SEARCH_MANGA:', message.query)
      const results = await searchWithFallback(message.query, message.extractedTitle)
      log.debug('SEARCH_MANGA results:', results.length)
      return results
    }

    case 'SEARCH_MANGADEX': {
      log.debug('SEARCH_MANGADEX:', message.query)
      const results = await searchMangaDex(message.query)
      log.debug('SEARCH_MANGADEX results:', results.length)
      return results
    }

    case 'SAVE_ITEM': {
      await storageService.save(message.item)
      return null
    }

    case 'GET_ALL_ITEMS': {
      const items = await storageService.getAll(message.format)
      return items
    }

    case 'UPDATE_PROGRESS': {
      const existing = await storageService.getById(message.providerId)
      if (!existing) {
        throw new Error('Item not found')
      }

      // Only update if new progress is greater than current
      const currentValue = parseFloat(existing.progress.value) || 0
      const newValue = parseFloat(message.progress) || 0

      if (newValue > currentValue) {
        await storageService.update(message.providerId, {
          progress: { ...existing.progress, value: message.progress },
          lastUrl: message.lastUrl,
          // Update notification baseline to current known chapters
          chaptersWhenAdded: existing.latestKnownChapters ?? existing.chaptersWhenAdded,
        })
      }
      return null
    }

    case 'UPDATE_ITEM': {
      // If progress is being updated, sync the notification baseline
      if (message.updates.progress) {
        const existing = await storageService.getById(message.providerId)
        if (existing && existing.latestKnownChapters !== null) {
          message.updates.chaptersWhenAdded = existing.latestKnownChapters
        }
      }
      await storageService.update(message.providerId, message.updates)
      return null
    }

    case 'DELETE_ITEM': {
      await storageService.delete(message.providerId)
      return null
    }

    case 'FIND_BY_TITLE': {
      const items = await storageService.getAll()
      const normalizedQuery = message.title.toLowerCase().trim()

      // First try exact match (normalized)
      const exactMatch = items.find((item) => {
        const allTitles = [item.titles.main, ...item.titles.alt]
        return allTitles.some((t) => t.toLowerCase().trim() === normalizedQuery)
      })
      if (exactMatch) return exactMatch

      // Then try containment match (either direction) for longer queries
      if (normalizedQuery.length >= 3) {
        const containMatch = items.find((item) => {
          const allTitles = [item.titles.main, ...item.titles.alt]
          return allTitles.some((t) => {
            const normTitle = t.toLowerCase().trim()
            return normTitle.includes(normalizedQuery) || normalizedQuery.includes(normTitle)
          })
        })
        if (containMatch) return containMatch
      }

      return null
    }

    case 'PING':
      return { pong: true }

    // Settings handlers
    case 'GET_SETTINGS': {
      return storageService.getSettings()
    }

    case 'UPDATE_SETTINGS': {
      const updated = await storageService.updateSettings(message.settings)
      // Re-setup alarm if interval changed
      await setupChapterCheckAlarm()
      return updated
    }

    // Notification handlers
    case 'TOGGLE_ITEM_NOTIFICATIONS': {
      await storageService.update(message.providerId, {
        notificationsEnabled: message.enabled,
      })
      return null
    }

    case 'CHECK_FOR_UPDATES': {
      await triggerManualCheck()
      return null
    }

    // Export/Import handlers
    case 'EXPORT_DATA': {
      return storageService.exportData()
    }

    case 'IMPORT_DATA': {
      return storageService.importData(message.data as ExportedData)
    }

    default:
      log.warn('Unknown message type:', message)
      return { error: 'Unknown message type' }
  }
}
