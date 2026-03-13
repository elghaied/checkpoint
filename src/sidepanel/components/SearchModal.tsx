import { useState } from 'react'
import type { UnifiedSearchResult } from '@/shared/types'
import { cleanSearchQuery } from '@/shared/utils'
import './SearchModal.css'

interface SearchModalProps {
  results: UnifiedSearchResult[]
  originalTitle: string | null
  isSearching?: boolean
  onSelect: (result: UnifiedSearchResult) => void
  onSearch: (query: string) => void
  onCancel: () => void
}

const SearchModal: React.FC<SearchModalProps> = ({
  results,
  originalTitle,
  isSearching,
  onSelect,
  onSearch,
  onCancel,
}) => {
  const [searchQuery, setSearchQuery] = useState('')

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      onSearch(searchQuery.trim())
    }
  }

  const handleGoogleSearch = () => {
    const title = cleanSearchQuery(originalTitle || searchQuery) || originalTitle || searchQuery
    const query = encodeURIComponent(`${title} manga alternative names`)
    window.open(`https://www.google.com/search?q=${query}`, '_blank')
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h2>Select Title</h2>
          <button className="modal__close" onClick={onCancel}>
            &times;
          </button>
        </div>
        <div className="modal__body">
          <form className="search-form" onSubmit={handleSearch}>
            <input
              type="text"
              className="search-form__input"
              placeholder="Search for a title..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button
              type="submit"
              className="btn btn--primary search-form__btn"
              disabled={isSearching || !searchQuery.trim()}
            >
              {isSearching ? '...' : 'Search'}
            </button>
          </form>

          {results.length === 0 && (
            <div className="search-empty">
              <p>No results found{originalTitle ? ` for "${originalTitle}"` : ''}</p>
              <button type="button" className="btn btn--secondary" onClick={handleGoogleSearch}>
                Find Alternative Names
              </button>
            </div>
          )}

          {results.map((result, index) => (
            <button
              key={`${result.provider}-${result.id}`}
              className="search-result"
              style={{ animationDelay: `${index * 0.05}s` }}
              onClick={() => onSelect(result)}
            >
              {result.coverUrl ? (
                <img
                  className="search-result__cover"
                  src={result.coverUrl}
                  alt={result.title.primary}
                />
              ) : (
                <div className="search-result__cover search-result__cover--placeholder" />
              )}
              <div className="search-result__info">
                <div className="search-result__title">
                  {result.title.primary}
                </div>
                <div className="search-result__meta">
                  {result.format} &bull; {result.provider}
                  {result.chapters && ` \u2022 ${result.chapters} chapters`}
                  {result.confidence < 1 && (
                    <> &bull; <span className={result.confidence < 0.7 ? 'search-result__confidence--low' : result.confidence >= 0.9 ? 'search-result__confidence--high' : ''}>{Math.round(result.confidence * 100)}% match</span></>
                  )}
                </div>
              </div>
            </button>
          ))}

          {results.length > 0 && (
            <div className="search-fallback">
              <button type="button" className="btn btn--secondary" onClick={handleGoogleSearch}>
                None of the above
              </button>
              <span className="search-fallback__hint">
                Opens Google search for alternative names
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default SearchModal
