import React from 'react'

export interface MatchProgressProps {
  currentTitle: string | null
  progress: { done: number; total: number }
  tally: { green: number; yellow: number; red: number; failed: number }
  isPaused: boolean
  startedAt: number | null
  onPause: () => void
  onResume: () => void
  onCancel: () => void
  failedCount: number
  onRetryFailed?: () => void
}

function calcEtaMinutes(done: number, total: number, startedAt: number | null): string | null {
  if (!startedAt || done === 0) return null
  const elapsed = Date.now() - startedAt
  const rate = done / elapsed // rows per ms
  const remaining = total - done
  if (rate === 0) return null
  const remainingMs = remaining / rate
  const minutes = Math.ceil(remainingMs / 60000)
  return minutes < 1 ? '<1 min' : `~${minutes} min`
}

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

const titleStyle: React.CSSProperties = {
  fontSize: '18px',
  fontWeight: 700,
  color: '#fff',
  margin: 0,
}

const buttonRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
}

const btnPauseStyle: React.CSSProperties = {
  padding: '7px 16px',
  background: 'transparent',
  color: '#a0a0c0',
  border: '1px solid #444',
  borderRadius: '6px',
  fontWeight: 600,
  fontSize: '13px',
  cursor: 'pointer',
}

const btnResumeStyle: React.CSSProperties = {
  padding: '7px 16px',
  background: '#6366f1',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  fontWeight: 600,
  fontSize: '13px',
  cursor: 'pointer',
}

const btnCancelStyle: React.CSSProperties = {
  padding: '7px 16px',
  background: 'transparent',
  color: '#f87171',
  border: '1px solid #f87171',
  borderRadius: '6px',
  fontWeight: 600,
  fontSize: '13px',
  cursor: 'pointer',
}

const progressBarWrapperStyle: React.CSSProperties = {
  position: 'relative',
  height: '28px',
  background: '#2a2a4a',
  borderRadius: '6px',
  overflow: 'hidden',
  marginBottom: '8px',
}

const progressBarFillStyle = (pct: number): React.CSSProperties => ({
  position: 'absolute',
  top: 0,
  left: 0,
  height: '100%',
  width: `${pct}%`,
  background: 'linear-gradient(90deg, #4a9eff, #6366f1)',
  borderRadius: '6px',
  transition: 'width 0.3s ease',
})

const progressLabelStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '13px',
  fontWeight: 600,
  color: '#fff',
}

const statsLineStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: '12px',
  color: '#888',
  marginBottom: '20px',
}

const nowSearchingCardStyle: React.CSSProperties = {
  background: '#2a2a4a',
  borderLeft: '3px solid #4a9eff',
  borderRadius: '4px',
  padding: '10px 14px',
  marginBottom: '20px',
  fontSize: '13px',
  color: '#c0c0e0',
}

const pausedCardStyle: React.CSSProperties = {
  background: '#2a2a4a',
  borderLeft: '3px solid #f59e0b',
  borderRadius: '4px',
  padding: '10px 14px',
  marginBottom: '20px',
  fontSize: '13px',
  color: '#f59e0b',
}

const tallyGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: '8px',
  marginBottom: '20px',
}

const tallyCardStyle: React.CSSProperties = {
  background: '#2a2a4a',
  borderRadius: '6px',
  padding: '12px 8px',
  textAlign: 'center',
}

const tallyValueStyle = (color: string): React.CSSProperties => ({
  fontSize: '22px',
  fontWeight: 700,
  color,
  display: 'block',
})

const tallyLabelStyle: React.CSSProperties = {
  fontSize: '11px',
  color: '#888',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

const btnRetryStyle: React.CSSProperties = {
  padding: '8px 18px',
  background: 'transparent',
  color: '#f87171',
  border: '1px solid #f87171',
  borderRadius: '6px',
  fontWeight: 600,
  fontSize: '13px',
  cursor: 'pointer',
}

export function MatchProgress({
  currentTitle,
  progress,
  tally,
  isPaused,
  startedAt,
  onPause,
  onResume,
  onCancel,
  failedCount,
  onRetryFailed,
}: MatchProgressProps) {
  const { done, total } = progress
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  const eta = calcEtaMinutes(done, total, startedAt)

  const isRunning = !isPaused
  const isStopped = !isRunning && done < total

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <h2 style={titleStyle}>{isPaused ? 'Import Paused' : 'Matching Titles'}</h2>
        <div style={buttonRowStyle}>
          {isRunning ? (
            <button style={btnPauseStyle} onClick={onPause}>
              Pause
            </button>
          ) : (
            <button style={btnResumeStyle} onClick={onResume}>
              Resume
            </button>
          )}
          <button style={btnCancelStyle} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div style={progressBarWrapperStyle}>
        <div style={progressBarFillStyle(pct)} />
        <div style={progressLabelStyle}>
          {done} / {total}
        </div>
      </div>

      {/* Stats line */}
      <div style={statsLineStyle}>
        <span>{pct}% complete</span>
        {eta && !isPaused && <span>{eta} remaining</span>}
      </div>

      {/* Now searching card */}
      {!isPaused && currentTitle && (
        <div style={nowSearchingCardStyle}>
          <span style={{ color: '#888', marginRight: '6px' }}>Now searching:</span>
          <strong style={{ color: '#e0e0e0' }}>{currentTitle}</strong>
        </div>
      )}

      {/* Paused card */}
      {isPaused && (
        <div style={pausedCardStyle}>
          Import paused — {done}/{total} searched
        </div>
      )}

      {/* Tally cards */}
      <div style={tallyGridStyle}>
        <div style={tallyCardStyle}>
          <span style={tallyValueStyle('#4ade80')}>{tally.green}</span>
          <span style={tallyLabelStyle}>Matched</span>
        </div>
        <div style={tallyCardStyle}>
          <span style={tallyValueStyle('#f59e0b')}>{tally.yellow}</span>
          <span style={tallyLabelStyle}>Possible</span>
        </div>
        <div style={tallyCardStyle}>
          <span style={tallyValueStyle('#f87171')}>{tally.red}</span>
          <span style={tallyLabelStyle}>No Match</span>
        </div>
        <div style={tallyCardStyle}>
          <span style={tallyValueStyle('#a0a0c0')}>{tally.failed}</span>
          <span style={tallyLabelStyle}>Failed</span>
        </div>
      </div>

      {/* Retry failed button — only when there are failures and loop is stopped */}
      {failedCount > 0 && isStopped && onRetryFailed && (
        <button style={btnRetryStyle} onClick={onRetryFailed}>
          Retry Failed ({failedCount})
        </button>
      )}
    </div>
  )
}
