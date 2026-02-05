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

export type MessageResponse<T = unknown> =
  | { data: T }
  | { error: string }
