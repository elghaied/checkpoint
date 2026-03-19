import { useState, useMemo, useCallback } from 'react'
import { applyFilters, countActiveFilters } from '@/shared/filterEngine'
import type { TrackedItem, FilterEntry } from '@/shared/types'

export interface FilterState {
  formats: string[]
  genres: FilterEntry[]
  tags: FilterEntry[]
}

const EMPTY_FILTERS: FilterState = { formats: [], genres: [], tags: [] }

export function useFilterPanel(items: TrackedItem[], activeTab: string) {
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS)
  const [isOpen, setIsOpen] = useState(false)

  // Collect unique genres and tags from items for picker display
  const availableGenres = useMemo(() => {
    const set = new Set<string>()
    items.forEach((item) => (item.genres ?? []).forEach((g) => set.add(g)))
    return Array.from(set).sort()
  }, [items])

  const availableTags = useMemo(() => {
    const set = new Set<string>()
    items.forEach((item) => (item.tags ?? []).forEach((t) => set.add(t)))
    return Array.from(set).sort()
  }, [items])

  // Combine tab filter with panel filters
  const effectiveFilters = useMemo((): FilterState => {
    const formats = activeTab !== 'ALL' ? [activeTab] : filters.formats
    return { formats, genres: filters.genres, tags: filters.tags }
  }, [activeTab, filters])

  const filteredItems = useMemo(
    () => applyFilters(items, effectiveFilters),
    [items, effectiveFilters]
  )

  const activeFilterCount = countActiveFilters(filters)

  // Toggle genre: cycle add(and) → or → exclude → remove
  const toggleGenre = useCallback((value: string) => {
    setFilters((prev) => {
      const existing = prev.genres.find((e) => e.value === value)
      if (!existing) return { ...prev, genres: [...prev.genres, { value, mode: 'and' }] }
      if (existing.mode === 'and') return { ...prev, genres: prev.genres.map((e) => e.value === value ? { ...e, mode: 'or' } : e) }
      if (existing.mode === 'or') return { ...prev, genres: prev.genres.map((e) => e.value === value ? { ...e, mode: 'exclude' } : e) }
      return { ...prev, genres: prev.genres.filter((e) => e.value !== value) }
    })
  }, [])

  // Toggle tag: same cycle
  const toggleTag = useCallback((value: string) => {
    setFilters((prev) => {
      const existing = prev.tags.find((e) => e.value === value)
      if (!existing) return { ...prev, tags: [...prev.tags, { value, mode: 'and' }] }
      if (existing.mode === 'and') return { ...prev, tags: prev.tags.map((e) => e.value === value ? { ...e, mode: 'or' } : e) }
      if (existing.mode === 'or') return { ...prev, tags: prev.tags.map((e) => e.value === value ? { ...e, mode: 'exclude' } : e) }
      return { ...prev, tags: prev.tags.filter((e) => e.value !== value) }
    })
  }, [])

  const clearFilters = useCallback(() => setFilters(EMPTY_FILTERS), [])

  const getSmartListFilters = useCallback(() => effectiveFilters, [effectiveFilters])

  return {
    filters, setFilters, isOpen, setIsOpen, filteredItems, activeFilterCount,
    availableGenres, availableTags, toggleGenre, toggleTag, clearFilters, getSmartListFilters,
  }
}
