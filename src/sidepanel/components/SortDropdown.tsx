import type { ExtensionSettings } from '@/shared/types'
import './SortDropdown.css'

type SortOrder = ExtensionSettings['sortOrder']

interface SortDropdownProps {
  value: SortOrder
  onChange: (value: SortOrder) => void
}

const SORT_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: 'updatedAt', label: 'Last Updated' },
  { value: 'alphabetical', label: 'A-Z' },
  { value: 'chaptersAhead', label: 'Chapters Ahead' },
  { value: 'createdAt', label: 'Recently Added' },
]

const SortDropdown: React.FC<SortDropdownProps> = ({ value, onChange }) => {
  return (
    <div className="sort-dropdown">
      <select
        className="sort-dropdown__select"
        value={value}
        onChange={(e) => onChange(e.target.value as SortOrder)}
        aria-label="Sort order"
      >
        {SORT_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  )
}

export default SortDropdown
