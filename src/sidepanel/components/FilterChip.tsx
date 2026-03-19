import type { FilterEntry } from '@/shared/types'
import './FilterChip.css'

interface FilterChipProps {
  entry: FilterEntry
  color?: string // for tags
  onClick: () => void
}

const MODE_ICONS = { and: '✓', or: '·', exclude: '✕' }
const MODE_CLASSES = { and: 'filter-chip--and', or: 'filter-chip--or', exclude: 'filter-chip--exclude' }

export function FilterChip({ entry, color, onClick }: FilterChipProps) {
  return (
    <button className={`filter-chip ${MODE_CLASSES[entry.mode]}`} onClick={onClick}>
      <span className="filter-chip__icon">{MODE_ICONS[entry.mode]}</span>
      {color && <span className="filter-chip__dot" style={{ backgroundColor: color }} />}
      <span className={entry.mode === 'exclude' ? 'filter-chip__label--strike' : ''}>
        {entry.value}
      </span>
    </button>
  )
}
