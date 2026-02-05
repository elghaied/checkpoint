// Page metadata extracted by content script
export interface PageMetadata {
  rawTitle: string
  detectedTitle: string | null
  chapterNumber: string | null
  pageUrl: string
  extractionConfidence: 'high' | 'medium' | 'low'
}

// Tracked item stored in local storage
export interface TrackedItem {
  provider: 'anilist'
  providerId: string
  mediaType: 'manga' | 'anime' | 'tv'
  format: 'MANGA' | 'MANHWA' | 'MANHUA'
  titles: {
    main: string
    alt: string[]
  }
  coverImage: string
  progress: {
    unit: 'chapter' | 'episode'
    value: string
  }
  lastUrl: string
  updatedAt: number
  createdAt: number

  // Chapter tracking fields
  chaptersWhenAdded: number | null       // Total chapters at time of addition (baseline)
  latestKnownChapters: number | null     // Most recent chapter count from AniList
  lastApiCheck: number | null            // Timestamp of last AniList check
  notificationsEnabled: boolean          // Per-item notification toggle
  anilistStatus: string | null           // RELEASING, FINISHED, HIATUS, etc.
}

// Extension settings
export interface ExtensionSettings {
  globalNotificationsEnabled: boolean    // Master toggle
  notifyOnlyNewReleases: boolean         // Only notify for chapters released AFTER tracking
  checkIntervalMinutes: number           // Default: 60
  exportVersion: number                  // Schema version for import/export
}

// Default settings
export const DEFAULT_SETTINGS: ExtensionSettings = {
  globalNotificationsEnabled: true,
  notifyOnlyNewReleases: true,
  checkIntervalMinutes: 60,
  exportVersion: 1,
}

// Export/Import format
export interface ExportedItem {
  provider: TrackedItem['provider']
  providerId: string
  mediaType: TrackedItem['mediaType']
  format: TrackedItem['format']
  titles: TrackedItem['titles']
  coverImage: string
  progress: TrackedItem['progress']
  lastUrl: string
  updatedAt: number
  createdAt: number
  chaptersWhenAdded: number | null
  latestKnownChapters: number | null
  notificationsEnabled: boolean
  anilistStatus: string | null
}

export interface ExportedData {
  version: number                        // Schema version for migrations
  exportedAt: number                     // Timestamp
  source: 'checkpoint-extension'
  settings: ExtensionSettings
  items: ExportedItem[]
}

// AniList media response
export interface AniListMedia {
  id: number
  type: string
  format: string
  title: {
    romaji: string
    english: string | null
    native: string
  }
  synonyms: string[]
  coverImage: {
    large: string
    medium: string
  }
  countryOfOrigin: string | null
  status: string
  chapters: number | null
}

// Message types for chrome.runtime messaging
export type MessageRequest =
  | { type: 'EXTRACT_METADATA'; tabId?: number }
  | { type: 'SEARCH_ANILIST'; query: string }
  | { type: 'SAVE_ITEM'; item: TrackedItem }
  | { type: 'GET_ALL_ITEMS'; format?: TrackedItem['format'] }
  | { type: 'UPDATE_PROGRESS'; providerId: string; progress: string; lastUrl: string }
  | { type: 'UPDATE_ITEM'; providerId: string; updates: Partial<TrackedItem> }
  | { type: 'DELETE_ITEM'; providerId: string }
  | { type: 'FIND_BY_TITLE'; title: string }
  | { type: 'PING' }
  // Settings
  | { type: 'GET_SETTINGS' }
  | { type: 'UPDATE_SETTINGS'; settings: Partial<ExtensionSettings> }
  // Notifications
  | { type: 'TOGGLE_ITEM_NOTIFICATIONS'; providerId: string; enabled: boolean }
  | { type: 'CHECK_FOR_UPDATES' }
  // Export/Import
  | { type: 'EXPORT_DATA' }
  | { type: 'IMPORT_DATA'; data: ExportedData }

export type MessageResponse<T = unknown> =
  | { data: T }
  | { error: string }
