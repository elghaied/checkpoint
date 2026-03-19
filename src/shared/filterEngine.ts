import type { TrackedItem, FilterEntry } from '@/shared/types'

export interface FilterCriteria {
  formats: string[]
  genres: FilterEntry[]
  tags: FilterEntry[]
}

/**
 * Apply tri-state filter entries to a list of string values.
 *
 * Rules within the category:
 *  - All AND-mode entries must be present in the item's values
 *  - At least one OR-mode entry must be present (if any OR entries exist)
 *  - No Exclude-mode entry may be present
 */
function matchesEntries(itemValues: string[], entries: FilterEntry[]): boolean {
  if (entries.length === 0) return true

  const andEntries = entries.filter(e => e.mode === 'and')
  const orEntries = entries.filter(e => e.mode === 'or')
  const excludeEntries = entries.filter(e => e.mode === 'exclude')

  // All AND entries must match
  for (const entry of andEntries) {
    if (!itemValues.includes(entry.value)) return false
  }

  // At least one OR entry must match (only if any OR entries exist)
  if (orEntries.length > 0) {
    const hasAnyOr = orEntries.some(entry => itemValues.includes(entry.value))
    if (!hasAnyOr) return false
  }

  // No Exclude entry may match
  for (const entry of excludeEntries) {
    if (itemValues.includes(entry.value)) return false
  }

  return true
}

/**
 * Filter a list of TrackedItems against the given criteria.
 *
 * Categories combine with AND:
 *  - Format filter: OR logic (item matches any selected format)
 *  - Genre filter: tri-state per entry (see matchesEntries)
 *  - Tag filter: tri-state per entry (see matchesEntries)
 *
 * If all categories are empty, all items are returned.
 */
export function applyFilters(items: TrackedItem[], criteria: FilterCriteria): TrackedItem[] {
  const { formats, genres, tags } = criteria

  // Short-circuit when nothing is active
  if (formats.length === 0 && genres.length === 0 && tags.length === 0) {
    return items
  }

  return items.filter(item => {
    // Format: OR across selected formats
    if (formats.length > 0 && !formats.includes(item.format)) return false

    // Genres: tri-state
    if (!matchesEntries(item.genres, genres)) return false

    // Tags: tri-state
    if (!matchesEntries(item.tags, tags)) return false

    return true
  })
}

/**
 * Count the total number of active filter entries across all categories.
 */
export function countActiveFilters(criteria: FilterCriteria): number {
  return criteria.formats.length + criteria.genres.length + criteria.tags.length
}
