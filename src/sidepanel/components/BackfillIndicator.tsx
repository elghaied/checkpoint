import type { BackfillProgress } from '@/shared/types'
import './BackfillIndicator.css'

interface BackfillIndicatorProps {
  progress: BackfillProgress
}

export function BackfillIndicator({ progress }: BackfillIndicatorProps) {
  const pct = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0
  return (
    <div className="backfill-indicator">
      <span className="backfill-indicator__text">
        Updating metadata... {progress.completed}/{progress.total}
      </span>
      <div className="backfill-indicator__bar">
        <div className="backfill-indicator__fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
