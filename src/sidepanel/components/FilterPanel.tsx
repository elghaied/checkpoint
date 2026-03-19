import { useState } from 'react'
import { FilterChip } from './FilterChip'
import type { FilterEntry, CustomTagRegistry } from '@/shared/types'
import type { FilterState } from '../hooks/useFilterPanel'
import './FilterPanel.css'

interface FilterPanelProps {
  isOpen: boolean
  genres: string[]
  tags: string[]
  tagRegistry: CustomTagRegistry
  genreFilters: FilterEntry[]
  tagFilters: FilterEntry[]
  onToggleGenre: (value: string) => void
  onToggleTag: (value: string) => void
  onClear: () => void
  onSaveAsList: (name: string, filters: FilterState) => void
  activeFilterCount: number
  filteredCount: number
  totalCount: number
  currentFilters: FilterState
}

export function FilterPanel({
  isOpen,
  genres,
  tags,
  tagRegistry,
  genreFilters,
  tagFilters,
  onToggleGenre,
  onToggleTag,
  onClear,
  onSaveAsList,
  activeFilterCount,
  filteredCount,
  totalCount,
  currentFilters,
}: FilterPanelProps) {
  const [genreSearch, setGenreSearch] = useState('')
  const [tagSearch, setTagSearch] = useState('')
  const [savingList, setSavingList] = useState(false)
  const [listName, setListName] = useState('')

  if (!isOpen) return null

  const filteredGenres = genreSearch.trim()
    ? genres.filter((g) => g.toLowerCase().includes(genreSearch.toLowerCase()))
    : genres

  const filteredTags = tagSearch.trim()
    ? tags.filter((t) => t.toLowerCase().includes(tagSearch.toLowerCase()))
    : tags

  const getGenreEntry = (value: string) => genreFilters.find((e) => e.value === value)
  const getTagEntry = (value: string) => tagFilters.find((e) => e.value === value)

  const handleSaveAsList = () => {
    if (savingList) {
      if (listName.trim()) {
        onSaveAsList(listName.trim(), currentFilters)
        setListName('')
        setSavingList(false)
      }
    } else {
      setSavingList(true)
    }
  }

  const handleCancelSave = () => {
    setSavingList(false)
    setListName('')
  }

  return (
    <div className="filter-panel">
      {/* Genres section */}
      {genres.length > 0 && (
        <section className="filter-panel__section">
          <div className="filter-panel__section-header">
            <span className="filter-panel__section-title">Genres</span>
            {genres.length > 6 && (
              <input
                className="filter-panel__search"
                type="text"
                placeholder="Search genres..."
                value={genreSearch}
                onChange={(e) => setGenreSearch(e.target.value)}
              />
            )}
          </div>
          <div className="filter-panel__chips">
            {filteredGenres.map((genre) => {
              const entry = getGenreEntry(genre)
              return entry ? (
                <FilterChip key={genre} entry={entry} onClick={() => onToggleGenre(genre)} />
              ) : (
                <button
                  key={genre}
                  className="filter-panel__plain-chip"
                  onClick={() => onToggleGenre(genre)}
                >
                  {genre}
                </button>
              )
            })}
            {filteredGenres.length === 0 && (
              <span className="filter-panel__empty">No genres match</span>
            )}
          </div>
        </section>
      )}

      {/* Tags section */}
      {tags.length > 0 && (
        <section className="filter-panel__section">
          <div className="filter-panel__section-header">
            <span className="filter-panel__section-title">Tags</span>
            {tags.length > 6 && (
              <input
                className="filter-panel__search"
                type="text"
                placeholder="Search tags..."
                value={tagSearch}
                onChange={(e) => setTagSearch(e.target.value)}
              />
            )}
          </div>
          <div className="filter-panel__chips">
            {filteredTags.map((tag) => {
              const entry = getTagEntry(tag)
              const color = tagRegistry[tag]?.color
              return entry ? (
                <FilterChip key={tag} entry={entry} color={color} onClick={() => onToggleTag(tag)} />
              ) : (
                <button
                  key={tag}
                  className="filter-panel__plain-chip"
                  onClick={() => onToggleTag(tag)}
                >
                  {color && (
                    <span
                      className="filter-panel__tag-dot"
                      style={{ backgroundColor: color }}
                    />
                  )}
                  {tag}
                </button>
              )
            })}
            {filteredTags.length === 0 && (
              <span className="filter-panel__empty">No tags match</span>
            )}
          </div>
        </section>
      )}

      {genres.length === 0 && tags.length === 0 && (
        <div className="filter-panel__no-data">
          No genres or tags available yet. Add tags to items via the edit modal.
        </div>
      )}

      {/* Bottom bar */}
      <div className="filter-panel__footer">
        <span className="filter-panel__count">
          Showing {filteredCount} of {totalCount}
        </span>
        <div className="filter-panel__actions">
          {activeFilterCount > 0 && !savingList && (
            <button className="filter-panel__clear" onClick={onClear}>
              Clear all
            </button>
          )}
          {activeFilterCount > 0 && (
            savingList ? (
              <div className="filter-panel__save-row">
                <input
                  className="filter-panel__name-input"
                  type="text"
                  placeholder="List name..."
                  value={listName}
                  onChange={(e) => setListName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveAsList()
                    if (e.key === 'Escape') handleCancelSave()
                  }}
                  autoFocus
                />
                <button
                  className="filter-panel__save-confirm"
                  onClick={handleSaveAsList}
                  disabled={!listName.trim()}
                >
                  Save
                </button>
                <button className="filter-panel__save-cancel" onClick={handleCancelSave}>
                  Cancel
                </button>
              </div>
            ) : (
              <button className="filter-panel__save-list" onClick={handleSaveAsList}>
                Save as List
              </button>
            )
          )}
        </div>
      </div>
    </div>
  )
}
