import { useState } from 'react'
import type { AniListMedia } from '@/shared/types'

interface SearchModalProps {
  results: AniListMedia[]
  originalTitle: string | null
  isSearching?: boolean
  onSelect: (media: AniListMedia) => void
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
    const query = encodeURIComponent(`${originalTitle || searchQuery} manga alternative names`)
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

          {results.map((media) => (
            <button
              key={media.id}
              className="search-result"
              onClick={() => onSelect(media)}
            >
              <img
                className="search-result__cover"
                src={media.coverImage.medium}
                alt={media.title.romaji}
              />
              <div className="search-result__info">
                <div className="search-result__title">
                  {media.title.english || media.title.romaji}
                </div>
                <div className="search-result__meta">
                  {media.format} &bull; {media.countryOfOrigin || 'JP'}
                  {media.chapters && ` \u2022 ${media.chapters} chapters`}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default SearchModal
