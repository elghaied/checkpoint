// Checkpoint Background Service Worker
import { searchAniList } from './anilist'
import { storageService } from '@/storage'
import type { MessageRequest } from '@/shared/types'

console.log('Checkpoint service worker started')

// Set up side panel behavior
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message)

  // Handle messages asynchronously
  handleMessage(message as MessageRequest, sender)
    .then((result) => sendResponse({ data: result }))
    .catch((error) => {
      console.error('Message handler error:', error)
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

      return chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_METADATA' })
    }

    case 'SEARCH_ANILIST': {
      console.log('[SEARCH_ANILIST] Searching for:', message.query)
      const results = await searchAniList(message.query)
      console.log('[SEARCH_ANILIST] Results:', results.length, 'items found')
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
        })
      }
      return null
    }

    case 'UPDATE_ITEM': {
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

      const match = items.find((item) => {
        const allTitles = [item.titles.main, ...item.titles.alt]
        return allTitles.some((t) => t.toLowerCase().trim() === normalizedQuery)
      })

      return match || null
    }

    case 'PING':
      return { pong: true }

    default:
      console.warn('Unknown message type:', message)
      return { error: 'Unknown message type' }
  }
}
