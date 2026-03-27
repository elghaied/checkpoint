import { useState, useRef, useEffect } from 'react'
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
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const currentLabel = SORT_OPTIONS.find((o) => o.value === value)?.label ?? 'Sort'

  return (
    <div className="sort-dropdown" ref={ref}>
      <button
        className="sort-dropdown__trigger"
        onClick={() => setOpen(!open)}
        aria-label="Sort order"
        aria-expanded={open}
      >
        <span className="sort-dropdown__label">{currentLabel}</span>
        <svg className="sort-dropdown__chevron" width="10" height="10" viewBox="0 0 12 12">
          <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      </button>
      {open && (
        <div className="sort-dropdown__menu">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`sort-dropdown__option ${opt.value === value ? 'sort-dropdown__option--active' : ''}`}
              onClick={() => { onChange(opt.value); setOpen(false) }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default SortDropdown
