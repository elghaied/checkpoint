import { useState, useMemo, useEffect } from 'react'
import type { ImportSession, ImportRow, MatchTier, PendingReviewList } from '@/shared/importTypes'
import type { TrackedItem, CustomTagRegistry, ComicKMedia } from '@/shared/types'
import { buildPendingReviewList, generateDiagnosticCsv, collectNewTags } from '../confirmLogic'
import { getNextTagColor } from '@/shared/tagColors'
import { saveItem, updateItem, getCustomTags, saveCustomTag, enrichComicK } from '../services/messaging'

export interface ConfirmPanelProps {
  session: ImportSession
  onComplete: (result: { added: number; updated: number; skipped: number }) => void
  onSavePendingReview: (list: PendingReviewList) => Promise<void>
  onClearSession: () => Promise<void>
  onBackToReview: () => void
}

// ---------------------------------------------------------------------------
// Style constants
// ---------------------------------------------------------------------------

const containerStyle: React.CSSProperties = {
  color: '#e0e0e0',
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
}

const headerStyle: React.CSSProperties = {
  marginBottom: '20px',
}

const pageTitleStyle: React.CSSProperties = {
  fontSize: '18px',
  fontWeight: 700,
  color: '#fff',
  margin: '0 0 4px',
}

const sectionStyle: React.CSSProperties = {
  background: '#16213e',
  borderRadius: '8px',
  padding: '16px',
  marginBottom: '16px',
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 600,
  color: '#aaa',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  margin: '0 0 12px',
}

const checkboxRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  marginBottom: '8px',
  cursor: 'pointer',
  userSelect: 'none',
}

const checkboxStyle: React.CSSProperties = {
  width: '16px',
  height: '16px',
  cursor: 'pointer',
}

const tierCountStyle = (color: string): React.CSSProperties => ({
  display: 'inline-block',
  background: color,
  color: '#fff',
  borderRadius: '4px',
  padding: '1px 7px',
  fontSize: '12px',
  fontWeight: 700,
  marginLeft: '6px',
})

const dupRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  fontSize: '13px',
  color: '#ccc',
  marginBottom: '6px',
}

const dupCountStyle: React.CSSProperties = {
  fontWeight: 700,
  color: '#fff',
  minWidth: '24px',
  textAlign: 'right',
}

const infoStyle: React.CSSProperties = {
  fontSize: '13px',
  color: '#ccc',
}

const progressStyle: React.CSSProperties = {
  fontSize: '14px',
  color: '#7ec8e3',
  fontWeight: 600,
  margin: '0 0 12px',
}

const buttonRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '10px',
  marginTop: '20px',
  flexWrap: 'wrap',
}

function importBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    background: disabled ? '#333' : '#4caf50',
    color: disabled ? '#888' : '#fff',
    border: 'none',
    borderRadius: '6px',
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'background 0.2s',
  }
}

const exportBtnStyle: React.CSSProperties = {
  background: '#2a2a4a',
  color: '#ccc',
  border: '1px solid #444',
  borderRadius: '6px',
  padding: '10px 20px',
  fontSize: '14px',
  fontWeight: 500,
  cursor: 'pointer',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countByTier(rows: ImportRow[], tier: MatchTier): number {
  return rows.filter((r) => {
    if (r.matchTier !== tier) return false
    const match = r.userSelection ?? r.bestMatch
    if (!match) return false
    if (r.userSkipped) return false
    return true
  }).length
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ConfirmPanel({ session, onComplete, onSavePendingReview, onClearSession, onBackToReview }: ConfirmPanelProps) {
  const { rows } = session

  // Tier checkbox state — green checked by default, others unchecked
  const [tierChecked, setTierChecked] = useState<Record<MatchTier, boolean>>({
    green: true,
    yellow: false,
    red: false,
  })

  // Import state
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null)

  // Live custom tag registry for new-tags count
  const [registry, setRegistry] = useState<CustomTagRegistry>({})

  useEffect(() => {
    getCustomTags().then(setRegistry).catch(() => {})
  }, [])

  // Tier counts
  const greenCount = useMemo(() => countByTier(rows, 'green'), [rows])
  const yellowCount = useMemo(() => countByTier(rows, 'yellow'), [rows])
  const redCount = useMemo(() => countByTier(rows, 'red'), [rows])

  // Duplicate summary
  const dupUpdates = useMemo(
    () => rows.filter((r) => r.duplicateOf && !r.duplicateConflict && !r.userSkipped).length,
    [rows]
  )
  const dupSkipped = useMemo(
    () => rows.filter((r) => r.duplicateOf && r.userSkipped).length,
    [rows]
  )
  const dupConflicts = useMemo(
    () => rows.filter((r) => !!r.duplicateConflict).length,
    [rows]
  )
  const hasDuplicates = dupUpdates + dupSkipped + dupConflicts > 0

  // New tags count
  const newTagsCount = useMemo(() => collectNewTags(rows, registry).length, [rows, registry])

  // How many rows will be imported
  const importableRows = useMemo(() =>
    rows.filter((r) => {
      if (!r.matchTier || !tierChecked[r.matchTier]) return false
      const match = r.userSelection ?? r.bestMatch
      if (!match) return false
      if (r.userSkipped) return false
      if (r.duplicateOf) return false // duplicates handled separately
      return true
    }),
    [rows, tierChecked]
  )

  // Duplicate update rows — always included if tier is checked or they're clean updates
  const dupUpdateRows = useMemo(
    () => rows.filter((r) => r.duplicateOf && !r.duplicateConflict && !r.userSkipped),
    [rows]
  )

  const totalToImport = importableRows.length + dupUpdateRows.length
  const canImport = totalToImport > 0 && !importing

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function toggleTier(tier: MatchTier) {
    setTierChecked((prev) => ({ ...prev, [tier]: !prev[tier] }))
  }

  async function handleImport() {
    setImporting(true)

    // 1. Load current tag registry
    let currentRegistry: CustomTagRegistry = {}
    try {
      currentRegistry = await getCustomTags()
    } catch {
      // proceed without registry — no new tags created
    }

    // 2. Create new tags
    const newTags = collectNewTags(rows, currentRegistry)
    const updatedRegistry = { ...currentRegistry }
    for (const tagName of newTags) {
      const color = getNextTagColor(updatedRegistry)
      try {
        await saveCustomTag(tagName, color)
        updatedRegistry[tagName] = { color }
      } catch {
        // skip failed tag creation
      }
    }

    // 3. Build case-insensitive lookup map for normalizing tag names
    const tagLookup = new Map<string, string>()
    for (const name of Object.keys(updatedRegistry)) {
      tagLookup.set(name.toLowerCase(), name)
    }

    function normalizeTags(csvTags: string[]): string[] {
      return csvTags.map((t) => tagLookup.get(t.toLowerCase()) ?? t)
    }

    let added = 0
    let updated = 0
    const skipped = dupSkipped

    const allWork = [
      ...importableRows.map((r) => ({ type: 'add' as const, row: r })),
      ...dupUpdateRows.map((r) => ({ type: 'update' as const, row: r })),
    ]

    setImportProgress({ current: 0, total: allWork.length })

    // 4. Process each item
    for (let i = 0; i < allWork.length; i++) {
      const work = allWork[i]
      const { row } = work
      const match = row.userSelection ?? row.bestMatch

      if (!match) {
        setImportProgress({ current: i + 1, total: allWork.length })
        continue
      }

      if (work.type === 'add') {
        const normalizedTags = normalizeTags(row.csvTags)
        const item: TrackedItem = {
          provider: match.provider,
          providerId: match.id,
          mediaType: 'manga',
          format: match.format,
          titles: { main: match.title.primary, alt: match.title.alt },
          coverImage: match.coverUrl,
          progress: { unit: 'chapter', value: row.csvChapter ?? '0' },
          lastUrl: row.csvUrl ?? '',
          updatedAt: Date.now(),
          createdAt: Date.now(),
          chaptersWhenAdded: match.chapters,
          latestKnownChapters: match.chapters,
          lastApiCheck: null,
          notificationsEnabled: true,
          anilistStatus: match.status,
          genres: match.genres,
          tags: normalizedTags,
          genresBackfilled: match.genres.length > 0,
          comickHid: null,
          comickSlug: null,
          anilistId: null,
        }
        // Enrich ComicK results with detail data
        if (item.provider === 'comick') {
          const comickData = match.originalData as ComicKMedia
          const enrichment = await enrichComicK(comickData.slug)
          if (enrichment) {
            item.comickHid = enrichment.hid
            item.comickSlug = enrichment.slug
            item.anilistId = enrichment.anilistId
            if (enrichment.genres.length > 0) {
              item.genres = enrichment.genres
              item.genresBackfilled = true
            }
            // Merge enriched alt titles
            const existingSet = new Set(item.titles.alt.map((t) => t.toLowerCase().trim()))
            for (const t of enrichment.altTitles) {
              if (t && !existingSet.has(t.toLowerCase().trim())) {
                item.titles.alt.push(t)
              }
            }
          }
        }

        try {
          await saveItem(item)
          added++
        } catch {
          // skip failed saves
        }
      } else {
        // duplicate update
        try {
          await updateItem(match.id, {
            progress: { unit: 'chapter', value: row.csvChapter ?? '0' },
            lastUrl: row.csvUrl ?? '',
            updatedAt: Date.now(),
          })
          updated++
        } catch {
          // skip failed updates
        }
      }

      setImportProgress({ current: i + 1, total: allWork.length })
    }

    // 5. Build pending review list from unimported rows + conflicts
    const importedTiers = new Set(
      (Object.keys(tierChecked) as MatchTier[]).filter((t) => tierChecked[t])
    )
    const pendingList = buildPendingReviewList(rows, importedTiers)

    // 6. Save pending review if it has items
    if (pendingList.items.length > 0) {
      try {
        await onSavePendingReview(pendingList)
      } catch {
        // proceed anyway
      }
    }

    // 7. Clear session
    try {
      await onClearSession()
    } catch {
      // proceed anyway
    }

    // 8. Complete
    onComplete({ added, updated, skipped })
  }

  function handleExportRemaining() {
    // Collect rows not being imported
    const remaining = rows.filter((r) => {
      // Conflict rows always go to remaining
      if (r.duplicateConflict) return true
      // Unchecked tier rows
      if (!r.matchTier || !tierChecked[r.matchTier]) return true
      // No match rows
      const match = r.userSelection ?? r.bestMatch
      if (!match) return true
      return false
    })

    const csv = generateDiagnosticCsv(remaining)
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `checkpoint-import-remaining-${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div style={containerStyle}>
      <button
        onClick={onBackToReview}
        style={{
          background: 'none', border: 'none', color: '#60a5fa',
          fontSize: '13px', cursor: 'pointer', padding: '0 0 12px',
          display: 'flex', alignItems: 'center', gap: '4px',
        }}
      >
        ← Back to Review
      </button>
      <div style={headerStyle}>
        <h2 style={pageTitleStyle}>Confirm Import</h2>
        <p style={{ margin: '0', fontSize: '13px', color: '#888' }}>
          Select which tiers to import, then click &quot;Import Selected&quot;.
        </p>
      </div>

      {/* Tier checkboxes */}
      <div style={sectionStyle}>
        <p style={sectionTitleStyle}>Tiers to import</p>

        <label style={checkboxRowStyle}>
          <input
            type="checkbox"
            style={checkboxStyle}
            checked={tierChecked.green}
            onChange={() => toggleTier('green')}
            disabled={importing}
          />
          <span style={{ fontSize: '14px', color: '#e0e0e0' }}>
            Matched titles
            <span style={tierCountStyle('#388e3c')}>{greenCount}</span>
          </span>
        </label>

        <label style={checkboxRowStyle}>
          <input
            type="checkbox"
            style={checkboxStyle}
            checked={tierChecked.yellow}
            onChange={() => toggleTier('yellow')}
            disabled={importing}
          />
          <span style={{ fontSize: '14px', color: '#e0e0e0' }}>
            Possible matches
            <span style={tierCountStyle('#f57f17')}>{yellowCount}</span>
          </span>
        </label>

        <label style={checkboxRowStyle}>
          <input
            type="checkbox"
            style={checkboxStyle}
            checked={tierChecked.red}
            onChange={() => toggleTier('red')}
            disabled={importing}
          />
          <span style={{ fontSize: '14px', color: '#e0e0e0' }}>
            No match / unresolved
            <span style={tierCountStyle('#c62828')}>{redCount}</span>
          </span>
        </label>
      </div>

      {/* Duplicate summary */}
      {hasDuplicates && (
        <div style={sectionStyle}>
          <p style={sectionTitleStyle}>
            {dupUpdates + dupSkipped + dupConflicts} duplicate{dupUpdates + dupSkipped + dupConflicts !== 1 ? 's' : ''} will be handled
          </p>

          {dupUpdates > 0 && (
            <div style={dupRowStyle}>
              <span style={dupCountStyle}>{dupUpdates}</span>
              <span>updates (higher chapter + URL)</span>
            </div>
          )}
          {dupSkipped > 0 && (
            <div style={dupRowStyle}>
              <span style={dupCountStyle}>{dupSkipped}</span>
              <span>skipped (same or lower chapter)</span>
            </div>
          )}
          {dupConflicts > 0 && (
            <div style={dupRowStyle}>
              <span style={dupCountStyle}>{dupConflicts}</span>
              <span style={{ color: '#ffa726' }}>conflicts → staged for review</span>
            </div>
          )}
        </div>
      )}

      {/* New tags */}
      {newTagsCount > 0 && (
        <div style={sectionStyle}>
          <p style={{ ...infoStyle, margin: 0 }}>
            <span style={{ fontWeight: 700, color: '#fff' }}>{newTagsCount}</span> new tag{newTagsCount !== 1 ? 's' : ''} will be created
          </p>
        </div>
      )}

      {/* Import progress */}
      {importing && importProgress && (
        <div style={sectionStyle}>
          <p style={progressStyle}>
            Importing... {importProgress.current}/{importProgress.total}
          </p>
          <div style={{ background: '#0d1b2a', borderRadius: '4px', height: '6px', overflow: 'hidden' }}>
            <div
              style={{
                background: '#4caf50',
                height: '100%',
                width: `${Math.round((importProgress.current / importProgress.total) * 100)}%`,
                transition: 'width 0.2s',
              }}
            />
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div style={buttonRowStyle}>
        <button
          style={importBtnStyle(!canImport)}
          disabled={!canImport}
          onClick={handleImport}
        >
          Import Selected ({totalToImport})
        </button>

        <button
          style={exportBtnStyle}
          onClick={handleExportRemaining}
          disabled={importing}
        >
          Export Remaining as CSV
        </button>
      </div>
    </div>
  )
}
