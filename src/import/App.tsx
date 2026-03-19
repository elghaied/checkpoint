import { useEffect } from 'react'
import { useImportSession } from './hooks/useImportSession'
import { useBatchMatcher } from './hooks/useBatchMatcher'
import styles from './styles/import.module.css'
import { FileUpload } from './components/FileUpload'
import { MatchProgress } from './components/MatchProgress'

export function App() {
  const {
    session, pendingReview, loading,
    saveSession, clearSession,
    savePendingReview: _savePendingReview, clearPendingReview: _clearPendingReview,
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
      case 'review':
        return <div className={styles.container}>Review phase (TODO)</div>
      case 'confirmed':
        return <div className={styles.container}>Confirmed (TODO)</div>
    }
  }

  // Pending review from a previous import
  if (pendingReview) {
    return (
      <div className={styles.container}>
        <p>You have {pendingReview.items.length} titles pending review from a previous import.</p>
      </div>
    )
  }

  // No session — show file upload
  return (
    <div className={styles.container}>
      <FileUpload
        existingSession={null}
        onSessionCreated={(s) => saveSession(s)}
        onDiscardSession={() => clearSession()}
      />
    </div>
  )
}
