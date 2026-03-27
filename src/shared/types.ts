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
  provider: 'comick' | 'anilist' | 'mangadex'
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
  chaptersWhenAdded: number | null       // Notification baseline: chapters known at last progress update
  latestKnownChapters: number | null     // Most recent chapter count from AniList
  lastApiCheck: number | null            // Timestamp of last AniList check
  notificationsEnabled: boolean          // Per-item notification toggle
  anilistStatus: string | null           // RELEASING, FINISHED, HIATUS, etc.

  // Genre & tag fields
  genres: string[]              // From API, normalized
  tags: string[]                // User-defined freeform tags
  genresBackfilled: boolean     // True once genre fetch attempted (both providers if needed)

  // ComicK cross-reference fields
  comickHid: string | null         // ComicK hid (stable unique ID)
  comickSlug: string | null        // ComicK slug (for API calls)
  anilistId: string | null         // AniList ID from ComicK links.al

  pinned: boolean                  // Pin to top of list
}

// Extension settings
export interface ExtensionSettings {
  globalNotificationsEnabled: boolean    // Master toggle
  notifyOnlyNewReleases: boolean         // Only notify for chapters released AFTER tracking
  checkIntervalMinutes: number           // Default: 60
  exportVersion: number                  // Schema version for import/export
  sortOrder: 'updatedAt' | 'alphabetical' | 'chaptersAhead' | 'createdAt'
}

// Default settings
export const DEFAULT_SETTINGS: ExtensionSettings = {
  globalNotificationsEnabled: true,
  notifyOnlyNewReleases: true,
  checkIntervalMinutes: 60,
  exportVersion: 1,
  sortOrder: 'updatedAt',
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
  genres: string[]
  tags: string[]
  genresBackfilled: boolean
  comickHid: string | null
  comickSlug: string | null
  anilistId: string | null
  pinned: boolean
}

export interface ExportedData {
  version: number                        // Schema version for migrations
  exportedAt: number                     // Timestamp
  source: 'checkpoint-extension'
  settings: ExtensionSettings
  items: ExportedItem[]
  customTags: CustomTagRegistry
  customLists: CustomList[]
}

// Import result with per-title details
export interface ImportResult {
  imported: number
  updated: number
  skipped: number
  details: {
    importedTitles: string[]
    updatedTitles: string[]
    skippedTitles: string[]
  }
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
  genres: string[]
}

// MangaDex media response (simplified)
export interface MangaDexMedia {
  id: string
  title: string // Primary extracted title
  altTitles: string[]
  coverUrl: string
  originalLanguage: string // ja, ko, zh, etc.
  status: string | null
  lastChapter: string | null
  genres: string[]
}

// ComicK media response (from search endpoint)
export interface ComicKMedia {
  hid: string
  slug: string
  title: string
  country: string              // 'jp', 'kr', 'cn'
  status: number               // 1=Ongoing, 2=Completed, 3=Cancelled, 4=Hiatus
  lastChapter: number | null   // from last_chapter, floored to int
  coverUrl: string             // pre-built URL from cover_url
  altTitles: string[]          // extracted from md_titles
  genres: string[]             // resolved genre names (empty from search, filled from detail)
}

// Unified search result for multi-provider search
export interface UnifiedSearchResult {
  provider: 'comick' | 'anilist' | 'mangadex'
  id: string
  title: { primary: string; alt: string[] }
  coverUrl: string
  format: 'MANGA' | 'MANHWA' | 'MANHUA'
  status: string | null
  chapters: number | null
  genres: string[]
  confidence: number
  originalData: ComicKMedia | AniListMedia | MangaDexMedia
}

// Filter entry for tri-state filtering
export interface FilterEntry {
  value: string
  mode: 'and' | 'or' | 'exclude'
}

// Custom list
export interface CustomList {
  id: string
  name: string
  type: 'manual' | 'smart'
  itemIds: string[]
  filters: {
    formats: string[]
    genres: FilterEntry[]
    tags: FilterEntry[]
  } | null
  createdAt: number
  updatedAt: number
}

// Tag registry
export interface CustomTagRegistry {
  [tagName: string]: { color: string }
}

// Backfill progress
export interface BackfillProgress {
  completed: number
  total: number
  status: 'running' | 'done'
}

// Message types for chrome.runtime messaging
export type MessageRequest =
  | { type: 'EXTRACT_METADATA'; tabId?: number }
  | { type: 'SEARCH_ANILIST'; query: string }
  | { type: 'SEARCH_MANGA'; query: string; extractedTitle: string }
  | { type: 'SEARCH_MANGADEX'; query: string }
  | { type: 'SEARCH_COMICK'; query: string }
  | { type: 'ENRICH_COMICK'; slug: string }
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
  // Tags
  | { type: 'GET_CUSTOM_TAGS' }
  | { type: 'UPDATE_CUSTOM_TAGS'; tagName: string; updates: { color?: string; newName?: string } }
  | { type: 'DELETE_CUSTOM_TAG'; tagName: string }
  // Lists
  | { type: 'GET_LISTS' }
  | { type: 'CREATE_LIST'; list: Omit<CustomList, 'id' | 'createdAt' | 'updatedAt'> }
  | { type: 'UPDATE_LIST'; listId: string; updates: Partial<CustomList> }
  | { type: 'DELETE_LIST'; listId: string }
  // CSV Import
  | { type: 'IMPORT_SEARCH'; query: string; extractedTitle: string }
  | { type: 'IMPORT_STATUS'; active: boolean }

export type MessageResponse<T = unknown> =
  | { data: T }
  | { error: string }
