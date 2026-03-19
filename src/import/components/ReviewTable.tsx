import { useState } from 'react'
import type { ImportSession, ImportRow, MatchTier } from '@/shared/importTypes'
import type { UnifiedSearchResult } from '@/shared/types'
import { SimilarModal } from './SimilarModal'

export interface ReviewTableProps {
  session: ImportSession
  onRowUpdate: (index: number, updates: Partial<ImportRow>) => void
  onContinue: () => void
  onRetryFailed: (() => void) | null
}

// ---------------------------------------------------------------------------
// Style constants
// ---------------------------------------------------------------------------

const containerStyle: React.CSSProperties = {
  color: '#e0e0e0',
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '20px',
}

const pageTitleStyle: React.CSSProperties = {
  fontSize: '18px',
  fontWeight: 700,
  color: '#fff',
  margin: 0,
}

const summaryGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: '10px',
  marginBottom: '16px',
}

function summaryTileStyle(bg: string): React.CSSProperties {
  return {
    background: bg,
    borderRadius: '8px',
    padding: '14px 12px',
    textAlign: 'center',
  }
}

const tileValueStyle: React.CSSProperties = {
  fontSize: '26px',
  fontWeight: 700,
  color: '#fff',
  display: 'block',
  lineHeight: 1,
  marginBottom: '4px',
}

const tileLabelStyle: React.CSSProperties = {
  fontSize: '11px',
  color: 'rgba(255,255,255,0.65)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

const filterBarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  marginBottom: '14px',
  flexWrap: 'wrap',
}

function pillStyle(active: boolean, color: string): React.CSSProperties {
  return {
    padding: '5px 12px',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    border: active ? `1px solid ${color}` : '1px solid #333',
    background: active ? `${color}22` : 'transparent',
    color: active ? color : '#888',
    userSelect: 'none',
  }
}

const searchInputStyle: React.CSSProperties = {
  padding: '6px 10px',
  background: '#12122a',
  border: '1px solid #333',
  borderRadius: '6px',
  color: '#e0e0e0',
  fontSize: '13px',
  outline: 'none',
  marginLeft: 'auto',
  width: '180px',
}

const tableWrapStyle: React.CSSProperties = {
  borderRadius: '6px',
  overflow: 'hidden',
  border: '1px solid #2a2a4a',
  marginBottom: '16px',
}

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '13px',
}

function thStyle(sortable?: boolean): React.CSSProperties {
  return {
    padding: '10px 12px',
    textAlign: 'left',
    background: '#1e1e36',
    color: '#a0a0c0',
    fontWeight: 600,
    borderBottom: '1px solid #2a2a4a',
    cursor: sortable ? 'pointer' : 'default',
    userSelect: 'none',
    whiteSpace: 'nowrap',
  }
}

function trStyle(index: number): React.CSSProperties {
  return {
    background: index % 2 === 0 ? '#16162e' : '#1a1a32',
  }
}

const tdBaseStyle: React.CSSProperties = {
  padding: '9px 12px',
  borderBottom: '1px solid #1e1e36',
  verticalAlign: 'middle',
}

function tierDotStyle(tier: MatchTier | null, isDuplicate: boolean, isSkipped: boolean): React.CSSProperties {
  const color = isSkipped
    ? '#666'
    : isDuplicate
    ? '#60a5fa'
    : tier === 'green'
    ? '#4ade80'
    : tier === 'yellow'
    ? '#f59e0b'
    : '#f87171'
  return {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    background: color,
    display: 'inline-block',
    flexShrink: 0,
  }
}

const coverThumbStyle: React.CSSProperties = {
  width: '28px',
  height: '40px',
  objectFit: 'cover',
  borderRadius: '2px',
  flexShrink: 0,
  background: '#12122a',
}

const matchedTitleStyle: React.CSSProperties = {
  fontSize: '13px',
  color: '#e0e0e0',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: '200px',
}

const noMatchStyle: React.CSSProperties = {
  fontSize: '13px',
  color: '#666',
  fontStyle: 'italic',
}

const conflictNoteStyle: React.CSSProperties = {
  fontSize: '11px',
  color: '#f59e0b',
  marginTop: '3px',
}

const formatBadgeStyle = (_format: string): React.CSSProperties => ({
  fontSize: '10px',
  fontWeight: 700,
  padding: '2px 6px',
  borderRadius: '3px',
  background: '#2a2a4a',
  color: '#a0a0c0',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  whiteSpace: 'nowrap',
})

function scoreColor(score: number | null, tier: MatchTier | null): string {
  if (score === null || tier === null) return '#f87171'
  if (tier === 'green') return '#4ade80'
  if (tier === 'yellow') return '#f59e0b'
  return '#f87171'
}

function actionLabel(row: ImportRow): string {
  if (row.userSkipped) return 'Undo Skip'
  if (row.duplicateOf) return 'Resolve'
  if (row.matchTier === 'green') return 'Similar'
  if (row.matchTier === 'yellow') return 'Review'
  return 'Search'
}

function actionBtnStyle(tier: MatchTier | null, isDuplicate: boolean): React.CSSProperties {
  const color = isDuplicate
    ? '#60a5fa'
    : tier === 'green'
    ? '#4ade80'
    : tier === 'yellow'
    ? '#f59e0b'
    : '#f87171'
  return {
    padding: '5px 12px',
    background: 'transparent',
    color,
    border: `1px solid ${color}`,
    borderRadius: '5px',
    fontWeight: 600,
    fontSize: '12px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  }
}

const bottomBarStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '10px',
  paddingTop: '8px',
}

const retryBtnStyle: React.CSSProperties = {
  padding: '9px 18px',
  background: 'transparent',
  color: '#f87171',
  border: '1px solid #f87171',
  borderRadius: '6px',
  fontWeight: 600,
  fontSize: '13px',
  cursor: 'pointer',
}

const continueBtnStyle: React.CSSProperties = {
  padding: '9px 20px',
  background: '#6366f1',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  fontWeight: 600,
  fontSize: '13px',
  cursor: 'pointer',
}

const emptyStyle: React.CSSProperties = {
  padding: '32px',
  textAlign: 'center',
  color: '#666',
  fontSize: '14px',
  fontStyle: 'italic',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type SortKey = 'title' | 'score'
type SortDir = 'asc' | 'desc'
type TierFilter = 'green' | 'yellow' | 'red' | 'duplicates' | 'skipped'

function computeCounts(rows: ImportRow[]) {
  let green = 0, yellow = 0, red = 0, duplicates = 0, skipped = 0
  for (const row of rows) {
    if (row.userSkipped) { skipped++; continue }
    if (row.duplicateOf) duplicates++
    if (row.matchTier === 'green') green++
    else if (row.matchTier === 'yellow') yellow++
    else if (row.matchTier === 'red') red++
  }
  return { green, yellow, red, duplicates, skipped }
}

function getConflictNote(row: ImportRow): string | null {
  if (!row.duplicateConflict) return null
  if (row.duplicateConflict.type === 'higher_chapter_no_url') {
    return 'Higher chapter but no URL to update'
  }
  if (row.duplicateConflict.type === 'different_site') {
    return `Different site: ${row.duplicateConflict.importUrl}`
  }
  return null
}

function sortArrow(key: SortKey, active: SortKey, dir: SortDir): string {
  if (key !== active) return ' ↕'
  return dir === 'asc' ? ' ↑' : ' ↓'
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReviewTable({ session, onRowUpdate, onContinue, onRetryFailed }: ReviewTableProps) {
  const [activeFilters, setActiveFilters] = useState<Set<TierFilter>>(new Set())
  const [textFilter, setTextFilter] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('title')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [modalRow, setModalRow] = useState<ImportRow | null>(null)

  const counts = computeCounts(session.rows)

  // Filter rows: apply tier/text/skipped filters
  const filteredRows = session.rows
    .filter((row) => {
      // When filters are active, only show matching categories
      if (activeFilters.size > 0) {
        const isDuplicate = Boolean(row.duplicateOf)
        const isSkipped = row.userSkipped
        const matchesDup = activeFilters.has('duplicates') && isDuplicate
        const matchesSkipped = activeFilters.has('skipped') && isSkipped
        const matchesTier = !isSkipped && (
          (activeFilters.has('green') && row.matchTier === 'green') ||
          (activeFilters.has('yellow') && row.matchTier === 'yellow') ||
          (activeFilters.has('red') && row.matchTier === 'red'))
        if (!matchesDup && !matchesTier && !matchesSkipped) return false
      }
      // Text filter
      if (textFilter.trim()) {
        const q = textFilter.toLowerCase()
        const matchTitle = row.csvTitle.toLowerCase().includes(q)
        const matchedTitle = (row.userSelection ?? row.bestMatch)?.title.primary.toLowerCase().includes(q) ?? false
        if (!matchTitle && !matchedTitle) return false
      }
      return true
    })
    .sort((a, b) => {
      let cmp = 0
      if (sortKey === 'title') {
        cmp = a.csvTitle.localeCompare(b.csvTitle)
      } else {
        const aScore = a.confidenceScore ?? -1
        const bScore = b.confidenceScore ?? -1
        cmp = aScore - bScore
      }
      return sortDir === 'asc' ? cmp : -cmp
    })

  function toggleFilter(f: TierFilter) {
    setActiveFilters((prev) => {
      const next = new Set(prev)
      if (next.has(f)) next.delete(f)
      else next.add(f)
      return next
    })
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  function handleModalSelect(result: UnifiedSearchResult) {
    if (!modalRow) return
    onRowUpdate(modalRow.index, {
      userSelection: result,
      matchTier: 'green',
      confidenceScore: result.confidence,
    })
    setModalRow(null)
  }

  function handleModalSkip() {
    if (!modalRow) return
    onRowUpdate(modalRow.index, { userSkipped: true })
    setModalRow(null)
  }

  const failedCount = session.rows.filter((r) => r.matchStatus === 'failed').length

  return (
    <div style={containerStyle}>
      {/* Page header */}
      <div style={headerStyle}>
        <h2 style={pageTitleStyle}>Review Matches</h2>
        <span style={{ fontSize: '13px', color: '#888' }}>
          {session.rows.length} titles
        </span>
      </div>

      {/* Summary tiles */}
      <div style={summaryGridStyle}>
        <div style={summaryTileStyle('rgba(74, 222, 128, 0.12)')}>
          <span style={{ ...tileValueStyle, color: '#4ade80' }}>{counts.green}</span>
          <span style={tileLabelStyle}>Matched</span>
        </div>
        <div style={summaryTileStyle('rgba(245, 158, 11, 0.12)')}>
          <span style={{ ...tileValueStyle, color: '#f59e0b' }}>{counts.yellow}</span>
          <span style={tileLabelStyle}>Possible</span>
        </div>
        <div style={summaryTileStyle('rgba(248, 113, 113, 0.12)')}>
          <span style={{ ...tileValueStyle, color: '#f87171' }}>{counts.red}</span>
          <span style={tileLabelStyle}>No Match</span>
        </div>
        <div style={summaryTileStyle('rgba(96, 165, 250, 0.12)')}>
          <span style={{ ...tileValueStyle, color: '#60a5fa' }}>{counts.duplicates}</span>
          <span style={tileLabelStyle}>Duplicates</span>
        </div>
        {counts.skipped > 0 && (
          <div style={summaryTileStyle('rgba(102, 102, 102, 0.12)')}>
            <span style={{ ...tileValueStyle, color: '#888' }}>{counts.skipped}</span>
            <span style={tileLabelStyle}>Skipped</span>
          </div>
        )}
      </div>

      {/* Filter bar */}
      <div style={filterBarStyle}>
        <span
          style={pillStyle(activeFilters.has('green'), '#4ade80')}
          onClick={() => toggleFilter('green')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter') toggleFilter('green') }}
        >
          Matched
        </span>
        <span
          style={pillStyle(activeFilters.has('yellow'), '#f59e0b')}
          onClick={() => toggleFilter('yellow')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter') toggleFilter('yellow') }}
        >
          Possible
        </span>
        <span
          style={pillStyle(activeFilters.has('red'), '#f87171')}
          onClick={() => toggleFilter('red')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter') toggleFilter('red') }}
        >
          No Match
        </span>
        <span
          style={pillStyle(activeFilters.has('duplicates'), '#60a5fa')}
          onClick={() => toggleFilter('duplicates')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter') toggleFilter('duplicates') }}
        >
          Duplicates
        </span>
        {counts.skipped > 0 && (
          <span
            style={pillStyle(activeFilters.has('skipped'), '#888')}
            onClick={() => toggleFilter('skipped')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') toggleFilter('skipped') }}
          >
            Skipped
          </span>
        )}
        <input
          type="text"
          style={searchInputStyle}
          placeholder="Filter titles…"
          value={textFilter}
          onChange={(e) => setTextFilter(e.target.value)}
        />
      </div>

      {/* Table */}
      <div style={tableWrapStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={{ ...thStyle(), width: '16px' }}></th>
              <th
                style={thStyle(true)}
                onClick={() => toggleSort('title')}
              >
                CSV Title{sortArrow('title', sortKey, sortDir)}
              </th>
              <th style={thStyle()}>Matched To</th>
              <th
                style={thStyle(true)}
                onClick={() => toggleSort('score')}
              >
                Score{sortArrow('score', sortKey, sortDir)}
              </th>
              <th style={thStyle()}>Ch</th>
              <th style={thStyle()}>Format</th>
              <th style={thStyle()}>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={7} style={emptyStyle}>
                  No rows match your current filters.
                </td>
              </tr>
            ) : (
              filteredRows.map((row, i) => {
                const isDuplicate = Boolean(row.duplicateOf)
                const matchResult = row.userSelection ?? row.bestMatch
                const conflictNote = getConflictNote(row)

                return (
                  <tr key={row.index} style={{ ...trStyle(i), ...(row.userSkipped ? { opacity: 0.5 } : {}) }}>
                    {/* Status dot */}
                    <td style={{ ...tdBaseStyle, textAlign: 'center' }}>
                      <span style={tierDotStyle(row.matchTier, isDuplicate, row.userSkipped)} />
                    </td>

                    {/* CSV Title */}
                    <td
                      style={{
                        ...tdBaseStyle,
                        maxWidth: '180px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        color: '#d0d0e0',
                      }}
                      title={row.csvTitle}
                    >
                      {row.csvTitle}
                    </td>

                    {/* Matched To */}
                    <td style={{ ...tdBaseStyle, maxWidth: '240px' }}>
                      {matchResult ? (
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                          {matchResult.coverUrl && (
                            <img
                              src={matchResult.coverUrl}
                              alt={matchResult.title.primary}
                              style={coverThumbStyle}
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                            />
                          )}
                          <div style={{ minWidth: 0 }}>
                            <div style={matchedTitleStyle} title={matchResult.title.primary}>
                              {matchResult.title.primary}
                            </div>
                            {isDuplicate && conflictNote && (
                              <div style={conflictNoteStyle}>{conflictNote}</div>
                            )}
                            {isDuplicate && !conflictNote && (
                              <div style={{ ...conflictNoteStyle, color: '#60a5fa' }}>
                                Already tracked
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span style={noMatchStyle}>No match found</span>
                      )}
                    </td>

                    {/* Score */}
                    <td
                      style={{
                        ...tdBaseStyle,
                        fontWeight: 700,
                        color: scoreColor(row.confidenceScore, row.matchTier),
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {row.confidenceScore !== null
                        ? `${Math.round(row.confidenceScore * 100)}%`
                        : '—'}
                    </td>

                    {/* Ch (from CSV) */}
                    <td style={{ ...tdBaseStyle, color: '#888', whiteSpace: 'nowrap' }}>
                      {row.csvChapter ?? '—'}
                    </td>

                    {/* Format */}
                    <td style={tdBaseStyle}>
                      {matchResult ? (
                        <span style={formatBadgeStyle(matchResult.format)}>
                          {matchResult.format}
                        </span>
                      ) : (
                        <span style={{ color: '#555' }}>—</span>
                      )}
                    </td>

                    {/* Action */}
                    <td style={tdBaseStyle}>
                      <button
                        style={row.userSkipped
                          ? { ...actionBtnStyle(row.matchTier, isDuplicate), color: '#888', borderColor: '#444' }
                          : actionBtnStyle(row.matchTier, isDuplicate)}
                        onClick={() => {
                          if (row.userSkipped) {
                            onRowUpdate(row.index, { userSkipped: false })
                          } else {
                            setModalRow(row)
                          }
                        }}
                      >
                        {actionLabel(row)}
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Bottom action bar */}
      <div style={bottomBarStyle}>
        {onRetryFailed !== null && failedCount > 0 && (
          <button style={retryBtnStyle} onClick={onRetryFailed}>
            Retry Failed ({failedCount})
          </button>
        )}
        <button style={continueBtnStyle} onClick={onContinue}>
          Continue to Import →
        </button>
      </div>

      {/* SimilarModal */}
      {modalRow !== null && (
        <SimilarModal
          row={modalRow}
          onSelect={handleModalSelect}
          onSkip={handleModalSkip}
          onClose={() => setModalRow(null)}
        />
      )}
    </div>
  )
}
