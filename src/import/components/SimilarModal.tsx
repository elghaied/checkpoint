import { useState, useEffect, useRef } from 'react'
import type { ImportRow } from '@/shared/importTypes'
import type { UnifiedSearchResult } from '@/shared/types'
import { importSearch } from '../services/messaging'
import { cleanSearchQuery } from '@/shared/utils'

export interface SimilarModalProps {
  row: ImportRow
  onSelect: (result: UnifiedSearchResult) => void
  onSkip: () => void
  onClose: () => void
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.7)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
}

const cardStyle: React.CSSProperties = {
  background: '#1e1e36',
  borderRadius: '10px',
  padding: '24px',
  width: '580px',
  maxWidth: '95vw',
  maxHeight: '85vh',
  overflowY: 'auto',
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  color: '#e0e0e0',
  boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  marginBottom: '16px',
}

const titleLabelStyle: React.CSSProperties = {
  fontSize: '11px',
  color: '#888',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: '4px',
}

const csvTitleStyle: React.CSSProperties = {
  fontSize: '16px',
  fontWeight: 700,
  color: '#fff',
  margin: 0,
  lineHeight: 1.3,
  maxWidth: '420px',
  wordBreak: 'break-word',
}

const closeBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#888',
  fontSize: '20px',
  cursor: 'pointer',
  padding: '0 4px',
  lineHeight: 1,
  flexShrink: 0,
}

const searchBarStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  marginBottom: '16px',
}

const searchInputStyle: React.CSSProperties = {
  flex: 1,
  padding: '9px 12px',
  background: '#12122a',
  border: '1px solid #444',
  borderRadius: '6px',
  color: '#e0e0e0',
  fontSize: '14px',
  outline: 'none',
}

const searchBtnStyle: React.CSSProperties = {
  padding: '9px 16px',
  background: '#6366f1',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  fontWeight: 600,
  fontSize: '13px',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

const sectionLabelStyle: React.CSSProperties = {
  fontSize: '11px',
  color: '#888',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: '8px',
}

const resultListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  marginBottom: '16px',
}

const resultCardStyle: React.CSSProperties = {
  display: 'flex',
  gap: '12px',
  alignItems: 'flex-start',
  background: '#2a2a4a',
  border: '1px solid #3a3a5a',
  borderRadius: '6px',
  padding: '10px 12px',
  cursor: 'pointer',
  transition: 'border-color 0.15s',
}

const coverStyle: React.CSSProperties = {
  width: '40px',
  height: '56px',
  objectFit: 'cover',
  borderRadius: '3px',
  flexShrink: 0,
  background: '#12122a',
}

const resultInfoStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
}

const resultTitleStyle: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: 600,
  color: '#e0e0e0',
  margin: '0 0 4px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const resultMetaStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  alignItems: 'center',
  flexWrap: 'wrap',
}

const formatBadgeStyle: React.CSSProperties = {
  fontSize: '10px',
  fontWeight: 700,
  padding: '2px 6px',
  borderRadius: '3px',
  background: '#3a3a5a',
  color: '#a0a0c0',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

const providerBadgeStyle = (provider: string): React.CSSProperties => ({
  fontSize: '10px',
  fontWeight: 600,
  padding: '2px 6px',
  borderRadius: '3px',
  background: provider === 'anilist' ? '#1a3a2a' : '#1a2a3a',
  color: provider === 'anilist' ? '#4ade80' : '#4a9eff',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
})

const chapterMetaStyle: React.CSSProperties = {
  fontSize: '11px',
  color: '#888',
}

const confidenceStyle = (confidence: number): React.CSSProperties => ({
  fontSize: '12px',
  fontWeight: 700,
  color: confidence >= 0.85 ? '#4ade80' : confidence >= 0.6 ? '#f59e0b' : '#f87171',
  marginLeft: 'auto',
  flexShrink: 0,
})

const footerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '8px',
  paddingTop: '12px',
  borderTop: '1px solid #2a2a4a',
}

const skipBtnStyle: React.CSSProperties = {
  padding: '8px 16px',
  background: 'transparent',
  color: '#a0a0c0',
  border: '1px solid #444',
  borderRadius: '6px',
  fontWeight: 600,
  fontSize: '13px',
  cursor: 'pointer',
}

const cancelBtnStyle: React.CSSProperties = {
  padding: '8px 16px',
  background: 'transparent',
  color: '#888',
  border: '1px solid #333',
  borderRadius: '6px',
  fontWeight: 600,
  fontSize: '13px',
  cursor: 'pointer',
}

const statusMsgStyle: React.CSSProperties = {
  fontSize: '13px',
  color: '#888',
  fontStyle: 'italic',
  textAlign: 'center',
  padding: '12px 0',
}

const errorMsgStyle: React.CSSProperties = {
  fontSize: '13px',
  color: '#f87171',
  textAlign: 'center',
  padding: '12px 0',
}

function ResultCard({
  result,
  onClick,
}: {
  result: UnifiedSearchResult
  onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      style={{
        ...resultCardStyle,
        borderColor: hovered ? '#6366f1' : '#3a3a5a',
      }}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick() }}
    >
      {result.coverUrl ? (
        <img
          src={result.coverUrl}
          alt={result.title.primary}
          style={coverStyle}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
      ) : (
        <div style={coverStyle} />
      )}
      <div style={resultInfoStyle}>
        <p style={resultTitleStyle} title={result.title.primary}>
          {result.title.primary}
        </p>
        <div style={resultMetaStyle}>
          <span style={formatBadgeStyle}>{result.format}</span>
          <span style={providerBadgeStyle(result.provider)}>{result.provider}</span>
          {result.chapters !== null && (
            <span style={chapterMetaStyle}>Ch {result.chapters}</span>
          )}
          <span style={confidenceStyle(result.confidence)}>
            {Math.round(result.confidence * 100)}%
          </span>
        </div>
      </div>
    </div>
  )
}

export function SimilarModal({ row, onSelect, onSkip, onClose }: SimilarModalProps) {
  const isRedTier = row.matchTier === 'red' || row.matchTier === null
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Build initial candidate list from row data
  const initialCandidates: UnifiedSearchResult[] = [
    ...(row.userSelection ? [row.userSelection] : []),
    ...(row.bestMatch && row.bestMatch !== row.userSelection ? [row.bestMatch] : []),
    ...row.alternatives,
  ]

  const [searchQuery, setSearchQuery] = useState(cleanSearchQuery(row.csvTitle))
  const [searchResults, setSearchResults] = useState<UnifiedSearchResult[] | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  // Auto-focus search bar for red-tier (primary resolution path)
  useEffect(() => {
    if (isRedTier && searchInputRef.current) {
      searchInputRef.current.focus()
    }
  }, [isRedTier])

  async function handleSearch() {
    const q = searchQuery.trim()
    if (!q) return
    setIsSearching(true)
    setSearchError(null)
    try {
      const result = await importSearch(q, row.csvTitle)
      if ('rateLimited' in result && result.rateLimited) {
        setSearchError(`Rate limited — please wait ${Math.ceil(result.waitMs / 1000)}s and try again.`)
      } else {
        setSearchResults(result as UnifiedSearchResult[])
      }
    } catch {
      setSearchError('Search failed. Please try again.')
    } finally {
      setIsSearching(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      handleSearch()
    }
    if (e.key === 'Escape') {
      onClose()
    }
  }

  // Determine which results to show
  const displayResults = searchResults ?? initialCandidates

  return (
    <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div style={cardStyle}>
        {/* Header */}
        <div style={headerStyle}>
          <div>
            <p style={titleLabelStyle}>CSV Title</p>
            <p style={csvTitleStyle}>{row.csvTitle}</p>
          </div>
          <button style={closeBtnStyle} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {/* Search bar */}
        <div style={searchBarStyle}>
          <input
            ref={searchInputRef}
            type="text"
            style={searchInputStyle}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search for a title..."
          />
          <button style={searchBtnStyle} onClick={handleSearch} disabled={isSearching}>
            {isSearching ? 'Searching…' : 'Search'}
          </button>
        </div>

        {/* Results */}
        {searchError && <p style={errorMsgStyle}>{searchError}</p>}

        {isSearching && <p style={statusMsgStyle}>Searching…</p>}

        {!isSearching && (
          <>
            <p style={sectionLabelStyle}>
              {searchResults !== null ? 'Search Results' : 'Suggestions'}
            </p>

            {displayResults.length === 0 ? (
              <p style={statusMsgStyle}>No results found.</p>
            ) : (
              <div style={resultListStyle}>
                {displayResults.map((result) => (
                  <ResultCard
                    key={`${result.provider}-${result.id}`}
                    result={result}
                    onClick={() => onSelect(result)}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* Footer */}
        <div style={footerStyle}>
          <button style={skipBtnStyle} onClick={onSkip}>
            Skip
          </button>
          <button style={cancelBtnStyle} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
