interface ImportBannerProps {
  importInProgress: { done: number; total: number } | null
  pendingCount: number
  onResume: () => void
  onDismiss: () => void
}

export function ImportBanner({ importInProgress, pendingCount, onResume, onDismiss }: ImportBannerProps) {
  // Priority: active import > pending review
  if (importInProgress) {
    return (
      <div style={{ padding: '8px 12px', background: '#1a2a3a', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, color: '#60a5fa', marginBottom: 8 }}>
        <span>Import in progress ({importInProgress.done}/{importInProgress.total})</span>
        <button onClick={onResume} style={{ fontSize: 12, color: '#60a5fa', background: 'none', border: '1px solid rgba(96,165,250,0.3)', padding: '2px 8px', borderRadius: 4, cursor: 'pointer' }}>Resume</button>
      </div>
    )
  }

  if (pendingCount > 0) {
    return (
      <div style={{ padding: '8px 12px', background: '#1a2a3a', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, color: '#60a5fa', marginBottom: 8 }}>
        <span>{pendingCount} titles pending review</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={onResume} style={{ fontSize: 12, color: '#60a5fa', background: 'none', border: '1px solid rgba(96,165,250,0.3)', padding: '2px 8px', borderRadius: 4, cursor: 'pointer' }}>Resume</button>
          <button onClick={onDismiss} style={{ fontSize: 12, color: '#888', background: 'none', border: 'none', padding: '2px 4px', cursor: 'pointer' }}>×</button>
        </div>
      </div>
    )
  }

  return null
}
