import { useImportSession } from './hooks/useImportSession'
import styles from './styles/import.module.css'

export function App() {
  const {
    session, pendingReview, loading,
    saveSession: _saveSession, clearSession: _clearSession,
    savePendingReview: _savePendingReview, clearPendingReview: _clearPendingReview,
  } = useImportSession()

  if (loading) {
    return <div className={styles.container}><p className={styles.subtitle}>Loading...</p></div>
  }

  // Existing session — route to current phase
  if (session) {
    switch (session.phase) {
      case 'parsed':
      case 'matching':
        return <div className={styles.container}>Match phase (TODO)</div>
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

  // No session — show file upload placeholder
  return <div className={styles.container}>FileUpload (TODO)</div>
}
