import { useState, useRef, useEffect } from 'react'
import type { CustomTagRegistry } from '@/shared/types'
import './BulkTagModal.css'

interface BulkTagModalProps {
  tagRegistry: CustomTagRegistry
  onConfirm: (tagName: string) => void
  onClose: () => void
}

const BulkTagModal: React.FC<BulkTagModalProps> = ({ tagRegistry, onConfirm, onClose }) => {
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const trimmed = input.trim()
  const existingTags = Object.keys(tagRegistry)
  const suggestions = existingTags.filter((t) =>
    !trimmed || t.toLowerCase().includes(trimmed.toLowerCase())
  )

  const handleSubmit = () => {
    if (trimmed) {
      onConfirm(trimmed)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal bulk-tag-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h2>Add Tag to Selected Items</h2>
        </div>
        <div className="modal__body">
          <input
            ref={inputRef}
            className="bulk-tag-modal__input"
            type="text"
            placeholder="Enter tag name..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
          />
          {existingTags.length > 0 && (
            <>
              <p className="bulk-tag-modal__label">Existing tags</p>
              <div className="bulk-tag-modal__suggestions">
                {suggestions.map((tag) => (
                  <button
                    key={tag}
                    className="bulk-tag-modal__suggestion"
                    onClick={() => onConfirm(tag)}
                  >
                    <span
                      className="bulk-tag-modal__dot"
                      style={{ backgroundColor: tagRegistry[tag]?.color ?? '#808080' }}
                    />
                    {tag}
                  </button>
                ))}
                {suggestions.length === 0 && (
                  <p className="bulk-tag-modal__no-match">No matching tags</p>
                )}
              </div>
            </>
          )}
        </div>
        <div className="modal__actions">
          <button className="btn btn--secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn--primary" onClick={handleSubmit} disabled={!trimmed}>Add Tag</button>
        </div>
      </div>
    </div>
  )
}

export default BulkTagModal
