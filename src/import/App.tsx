import { useState, useEffect } from 'react'
import { useImportSession } from './hooks/useImportSession'
import { useBatchMatcher } from './hooks/useBatchMatcher'
import styles from './styles/import.module.css'
import { FileUpload } from './components/FileUpload'
import { MatchProgress } from './components/MatchProgress'
import { ReviewTable } from './components/ReviewTable'
import { ConfirmPanel } from './components/ConfirmPanel'
import type { ImportRow, ImportSession, PendingReviewList } from '@/shared/importTypes'

export function App() {
  const [importResult, setImportResult] = useState<{ added: number; updated: number; skipped: number } | null>(null)

  const {
    session, pendingReview, loading,
    saveSession, clearSession,
    savePendingReview, clearPendingReview,
  } = useImportSession()

  const matcher = useBatchMatcher(
    // onCheckpoint: save session to storage
    async (s) => { await saveSession(s) },
    // onComplete: save completed session (now in review phase)
    async (s) => { await saveSession(s) },
  )

  // Auto-start matcher when session enters the matching phase
  useEffect(() => {
    if (session?.phase === 'matching' && !matcher.isRunning && !matcher.isPaused) {
      matcher.start(session)
    }
  }, [session?.phase]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return <div className={styles.container}><p className={styles.subtitle}>Loading...</p></div>
  }

  // Existing session — route to current phase
  if (session) {
    switch (session.phase) {
      case 'parsed':
        return (
          <div className={styles.container}>
            <FileUpload
              existingSession={session}
              onSessionCreated={(s) => saveSession(s)}
              onDiscardSession={() => clearSession()}
            />
          </div>
        )
      case 'matching':
        return (
          <div className={styles.container}>
            <MatchProgress
              currentTitle={matcher.currentTitle}
              progress={matcher.progress}
              tally={matcher.tally}
              isPaused={matcher.isPaused}
              startedAt={matcher.startedAt}
              onPause={matcher.pause}
              onResume={matcher.resume}
              onCancel={() => {
                matcher.cancel()
                clearSession()
              }}
              failedCount={matcher.tally.failed}
              onRetryFailed={matcher.retryFailed}
            />
          </div>
        )
      case 'review': {
        const handleRowUpdate = (index: number, updates: Partial<ImportRow>) => {
          const newRows = session.rows.map((r) =>
            r.index === index ? { ...r, ...updates } : r
          )
          saveSession({ ...session, rows: newRows })
        }

        const failedRows = session.rows.filter((r) => r.matchStatus === 'failed')
        const handleRetryFailed = failedRows.length > 0
          ? () => {
              const updatedRows = session.rows.map((r) =>
                r.matchStatus === 'failed' ? { ...r, matchStatus: 'pending' as const } : r
              )
              saveSession({ ...session, phase: 'matching', rows: updatedRows })
            }
          : null

        return (
          <div className={styles.container}>
            <ReviewTable
              session={session}
              onRowUpdate={handleRowUpdate}
              onContinue={() => saveSession({ ...session, phase: 'confirmed' })}
              onRetryFailed={handleRetryFailed}
            />
          </div>
        )
      }
      case 'confirmed':
        return (
          <div className={styles.container}>
            <ConfirmPanel
              session={session}
              onComplete={setImportResult}
              onSavePendingReview={savePendingReview}
              onClearSession={clearSession}
              onBackToReview={() => saveSession({ ...session, phase: 'review' })}
            />
          </div>
        )
    }
  }

  // Import complete screen
  if (importResult) {
    return (
      <div className={styles.container}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#fff', margin: '0 0 16px' }}>
          Import Complete
        </h2>
        <p style={{ fontSize: '15px', color: '#ccc', margin: '0 0 8px' }}>
          <strong style={{ color: '#fff' }}>{importResult.added}</strong> title{importResult.added !== 1 ? 's' : ''} added to your library
        </p>
        {importResult.updated > 0 && (
          <p style={{ fontSize: '15px', color: '#ccc', margin: '0 0 8px' }}>
            <strong style={{ color: '#fff' }}>{importResult.updated}</strong> existing title{importResult.updated !== 1 ? 's' : ''} updated
          </p>
        )}
        {importResult.skipped > 0 && (
          <p style={{ fontSize: '15px', color: '#ccc', margin: '0 0 8px' }}>
            <strong style={{ color: '#fff' }}>{importResult.skipped}</strong> skipped
          </p>
        )}
        {pendingReview && pendingReview.items.length > 0 && (
          <p style={{ fontSize: '15px', color: '#ffa726', margin: '0 0 8px' }}>
            <strong>{pendingReview.items.length}</strong> title{pendingReview.items.length !== 1 ? 's' : ''} staged for later review
          </p>
        )}
        <button
          style={{
            marginTop: '20px',
            background: '#4caf50',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            padding: '10px 20px',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
          onClick={() => setImportResult(null)}
        >
          Import Another CSV
        </button>
      </div>
    )
  }

  const resumePendingReview = (pending: PendingReviewList) => {
    const rows: ImportRow[] = pending.items.map((item, i) => ({
      index: i,
      csvTitle: item.csvTitle,
      csvChapter: item.csvChapter,
      csvUrl: item.csvUrl,
      csvTags: item.csvTags,
      matchStatus: 'matched' as const,
      matchTier: item.tier,
      bestMatch: item.bestMatch,
      alternatives: item.alternatives,
      confidenceScore: item.confidenceScore,
      duplicateOf: null,
      duplicateConflict: null,
      userSelection: null,
      userSkipped: false,
    }))

    const session: ImportSession = {
      id: crypto.randomUUID(),
      phase: 'review',
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      csvSummary: {
        totalRows: rows.length,
        withChapters: rows.filter((r) => r.csvChapter !== null).length,
        withUrls: rows.filter((r) => r.csvUrl !== null).length,
        withTags: rows.filter((r) => r.csvTags.length > 0).length,
      },
      rows,
    }

    clearPendingReview()
    saveSession(session)
  }

  // No session — show file upload (with pending review banner if applicable)
  return (
    <div className={styles.container}>
      {pendingReview && pendingReview.items.length > 0 && (
        <div style={{
          padding: '12px 16px', background: '#1a2a3a', borderRadius: 8,
          marginBottom: 16, fontSize: 13, color: '#60a5fa',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>{pendingReview.items.length} titles pending review from a previous import</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => resumePendingReview(pendingReview)}
                style={{
                  fontSize: 12, color: '#60a5fa', background: 'none',
                  border: '1px solid rgba(96,165,250,0.3)', borderRadius: 4,
                  cursor: 'pointer', padding: '4px 10px',
                }}
              >
                Review
              </button>
              <button
                onClick={() => {
                  if (confirm(`Discard ${pendingReview.items.length} unreviewed titles? This can't be undone.`)) {
                    clearPendingReview()
                  }
                }}
                style={{
                  fontSize: 12, color: '#888', background: 'none',
                  border: 'none', cursor: 'pointer', padding: '4px 6px',
                }}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
      <FileUpload
        existingSession={null}
        onSessionCreated={(s) => saveSession(s)}
        onDiscardSession={() => clearSession()}
      />
    </div>
  )
}
