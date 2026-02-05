import type {
  MessageRequest,
  MessageResponse,
  PageMetadata,
  TrackedItem,
  AniListMedia,
  ExtensionSettings,
  ExportedData,
} from '@/shared/types'

/**
 * Send a message to the background service worker
 */
async function sendMessage<T>(message: MessageRequest): Promise<T> {
  const response = await chrome.runtime.sendMessage(message) as MessageResponse<T>

  if ('error' in response) {
    throw new Error(response.error)
  }

  return response.data
}

/**
 * Extract metadata from the current active tab
 */
export async function extractMetadata(): Promise<PageMetadata> {
  return sendMessage<PageMetadata>({ type: 'EXTRACT_METADATA' })
}

/**
 * Search AniList for media matching the query
 */
export async function searchAniList(query: string): Promise<AniListMedia[]> {
  return sendMessage<AniListMedia[]>({ type: 'SEARCH_ANILIST', query })
}

/**
 * Save a new tracked item
 */
export async function saveItem(item: TrackedItem): Promise<void> {
  return sendMessage<void>({ type: 'SAVE_ITEM', item })
}

/**
 * Get all tracked items, optionally filtered by format
 */
export async function getAllItems(format?: TrackedItem['format']): Promise<TrackedItem[]> {
  return sendMessage<TrackedItem[]>({ type: 'GET_ALL_ITEMS', format })
}

/**
 * Update progress for a tracked item
 */
export async function updateProgress(
  providerId: string,
  progress: string,
  lastUrl: string
): Promise<void> {
  return sendMessage<void>({ type: 'UPDATE_PROGRESS', providerId, progress, lastUrl })
}

/**
 * Delete a tracked item
 */
export async function deleteItem(providerId: string): Promise<void> {
  return sendMessage<void>({ type: 'DELETE_ITEM', providerId })
}

/**
 * Find a tracked item by title (checks main and alt titles)
 */
export async function findByTitle(title: string): Promise<TrackedItem | null> {
  return sendMessage<TrackedItem | null>({ type: 'FIND_BY_TITLE', title })
}

/**
 * Ping the service worker (for testing)
 */
export async function ping(): Promise<boolean> {
  const response = await sendMessage<{ pong: boolean }>({ type: 'PING' })
  return response.pong
}

// -------------------------------------------------------------------------
// Settings
// -------------------------------------------------------------------------

/**
 * Get extension settings
 */
export async function getSettings(): Promise<ExtensionSettings> {
  return sendMessage<ExtensionSettings>({ type: 'GET_SETTINGS' })
}

/**
 * Update extension settings
 */
export async function updateSettings(settings: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
  return sendMessage<ExtensionSettings>({ type: 'UPDATE_SETTINGS', settings })
}

// -------------------------------------------------------------------------
// Notifications
// -------------------------------------------------------------------------

/**
 * Toggle notifications for a specific item
 */
export async function toggleItemNotifications(providerId: string, enabled: boolean): Promise<void> {
  return sendMessage<void>({ type: 'TOGGLE_ITEM_NOTIFICATIONS', providerId, enabled })
}

/**
 * Manually trigger a chapter check
 */
export async function checkForUpdates(): Promise<void> {
  return sendMessage<void>({ type: 'CHECK_FOR_UPDATES' })
}

// -------------------------------------------------------------------------
// Export/Import
// -------------------------------------------------------------------------

/**
 * Export all data
 */
export async function exportData(): Promise<ExportedData> {
  return sendMessage<ExportedData>({ type: 'EXPORT_DATA' })
}

/**
 * Import data from backup
 */
export async function importData(data: ExportedData): Promise<{ imported: number; updated: number; skipped: number }> {
  return sendMessage<{ imported: number; updated: number; skipped: number }>({ type: 'IMPORT_DATA', data })
}
