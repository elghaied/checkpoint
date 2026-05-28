// Search
export const CONFIDENCE_THRESHOLD = 0.7
export const MAX_LOW_CONFIDENCE_RESULTS = 5
export const SEARCH_RESULTS_PER_PAGE = 10
export const BATCH_FETCH_PAGE_SIZE = 50
// Minimum natural token-overlap score required before applying a position boost.
// Below this, top-ranked results are assumed to be fuzzy/unrelated (e.g. ComicK
// returning anything for a manga not in its database) and should not be promoted
// above the confidence threshold.
export const MIN_SCORE_FOR_POSITION_BOOST = 0.3

// Content script injection
export const CONTENT_SCRIPT_MAX_RETRIES = 3
export const CONTENT_SCRIPT_RETRY_DELAY_MS = 150

// Rate limiting
export const MANGADEX_RATE_LIMIT_DELAY_MS = 250

// UI
export const TOAST_DURATION_MS = 2000

// Chapter checking
export const CHAPTER_CHECK_INITIAL_DELAY_MIN = 1
export const CHAPTER_CHECK_ALARM_NAME = 'checkpoint-chapter-check'

// Tag colors
export const TAG_COLORS = [
  '#e94560', '#00d4aa', '#f59e0b', '#8b5cf6',
  '#3b82f6', '#ec4899', '#10b981', '#f97316',
  '#06b6d4', '#84cc16', '#a855f7', '#ef4444',
]

// Backfill
export const BACKFILL_BATCH_SIZE = 5
export const BACKFILL_BATCH_DELAY_MS = 1100

// Default lists
export const DEFAULT_LIST_NAMES = ['Reading', 'Completed', 'Plan to Read']
export const MAX_LIST_NESTING_DEPTH = 3

// Storage keys
export const CUSTOM_TAGS_KEY = 'customTags'
export const CUSTOM_LISTS_KEY = 'customLists'
export const BACKFILL_PROGRESS_KEY = 'backfillProgress'

// CSV Import
export const IMPORT_CONFIDENCE_GREEN = 0.85
export const IMPORT_CONFIDENCE_YELLOW = 0.50
export const IMPORT_BATCH_CHECKPOINT_SIZE = 10
export const IMPORT_RATE_LIMIT_PER_MINUTE = 75
export const IMPORT_SESSION_KEY = 'importSession'
export const PENDING_REVIEW_KEY = 'pendingReview'
export const PENDING_REVIEW_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

// ComicK API
export const COMICK_API_BASE = 'https://api.comick.dev'
export const COMICK_RATE_LIMIT_DELAY_MS = 300
export const COMICK_BATCH_SIZE = 5
export const MIGRATION_CONFIDENCE_THRESHOLD = 0.85
export const MIGRATION_STORAGE_KEY = 'comickMigrationComplete'
