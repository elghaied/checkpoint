import { useState, useRef, useEffect } from 'react'
import type { CustomTagRegistry } from '@/shared/types'
import TagColorPicker from './TagColorPicker'
import './BulkTagModal.css'

interface BulkTagModalProps {
  tagRegistry: CustomTagRegistry
  getNextColor: () => string
  onConfirm: (tagName: string, color: string) => void
  onClose: () => void
}

const BulkTagModal: React.FC<BulkTagModalProps> = ({ tagRegistry, getNextColor, onConfirm, onClose }) => {
  const [input, setInput] = useState('')
  const [selectedColor, setSelectedColor] = useState<string | null>(null)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const trimmed = input.trim()
  const existingTags = Object.keys(tagRegistry)
  const suggestions = existingTags.filter((t) =>
    !trimmed || t.toLowerCase().includes(trimmed.toLowerCase())
  )

  const isNewTag = trimmed.length > 0 && !tagRegistry[trimmed]
  const newTagColor = selectedColor ?? getNextColor()

  const handleConfirmNew = () => {
    if (trimmed) {
      const color = tagRegistry[trimmed]?.color ?? newTagColor
      onConfirm(trimmed, color)
    }
  }

  const handleSelectExisting = (tag: string) => {
    onConfirm(tag, tagRegistry[tag]?.color ?? getNextColor())
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal bulk-tag-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h2>Add Tag to Selected Items</h2>
        </div>
        <div className="modal__body">
          <div className="bulk-tag-modal__input-row">
            <input
              ref={inputRef}
              className="bulk-tag-modal__input"
              type="text"
              placeholder="Enter tag name..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleConfirmNew() }}
            />
            {isNewTag && (
              <div className="bulk-tag-modal__color-wrap">
                <button
                  type="button"
                  className="bulk-tag-modal__color-btn"
                  style={{ backgroundColor: newTagColor }}
                  onClick={() => setShowColorPicker(!showColorPicker)}
                  title="Pick color"
                />
                {showColorPicker && (
                  <TagColorPicker
                    currentColor={newTagColor}
                    onSelect={(color) => {
                      setSelectedColor(color)
                      setShowColorPicker(false)
                    }}
                    onClose={() => setShowColorPicker(false)}
                  />
                )}
              </div>
            )}
          </div>

          {isNewTag && (
            <button
              className="bulk-tag-modal__create"
              onClick={handleConfirmNew}
            >
              <span className="bulk-tag-modal__dot" style={{ backgroundColor: newTagColor }} />
              Create "{trimmed}"
            </button>
          )}

          {existingTags.length > 0 && (
            <>
              <p className="bulk-tag-modal__label">Existing tags</p>
              <div className="bulk-tag-modal__suggestions">
                {suggestions.map((tag) => (
                  <button
                    key={tag}
                    className="bulk-tag-modal__suggestion"
                    onClick={() => handleSelectExisting(tag)}
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
        </div>
      </div>
    </div>
  )
}

export default BulkTagModal
