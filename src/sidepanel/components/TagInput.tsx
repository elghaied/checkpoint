import { useState, useRef, useEffect } from 'react'
import type { CustomTagRegistry } from '@/shared/types'
import TagColorPicker from './TagColorPicker'
import './TagInput.css'

interface TagInputProps {
  itemTags: string[]
  tagRegistry: CustomTagRegistry
  onAddTag: (name: string, color: string) => void
  onRemoveTag: (name: string) => void
  onUpdateTagColor: (name: string, color: string) => void
  getNextColor: () => string
}

const TagInput: React.FC<TagInputProps> = ({
  itemTags,
  tagRegistry,
  onAddTag,
  onRemoveTag,
  onUpdateTagColor,
  getNextColor,
}) => {
  const [inputValue, setInputValue] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [colorPickerTag, setColorPickerTag] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close dropdown and color picker on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
        setColorPickerTag(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const trimmedInput = inputValue.trim()

  // Suggestions: known tags not already on item, filtered by input
  const suggestions = Object.keys(tagRegistry).filter((name) => {
    if (itemTags.includes(name)) return false
    if (!trimmedInput) return true
    return name.toLowerCase().includes(trimmedInput.toLowerCase())
  })

  const showCreateOption =
    trimmedInput.length > 0 &&
    !itemTags.includes(trimmedInput) &&
    !tagRegistry[trimmedInput]

  const handleAddTag = (name: string) => {
    const normalizedName = name.trim()
    if (!normalizedName || itemTags.includes(normalizedName)) return
    const color = tagRegistry[normalizedName]?.color ?? getNextColor()
    onAddTag(normalizedName, color)
    setInputValue('')
    setShowDropdown(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (trimmedInput) {
        handleAddTag(trimmedInput)
      }
    } else if (e.key === 'Escape') {
      setShowDropdown(false)
      setColorPickerTag(null)
    }
  }

  const handleDotClick = (e: React.MouseEvent, tagName: string) => {
    e.stopPropagation()
    setColorPickerTag((prev) => (prev === tagName ? null : tagName))
  }

  const getTagColor = (name: string): string => {
    return tagRegistry[name]?.color ?? '#a0a0a0'
  }

  return (
    <div className="tag-input" ref={containerRef}>
      {/* Current tag pills */}
      {itemTags.length > 0 && (
        <div className="tag-input__pills">
          {itemTags.map((tag) => (
            <span
              key={tag}
              className="tag-input__pill"
              style={{ borderColor: getTagColor(tag) }}
            >
              <span className="tag-input__pill-wrapper">
                <button
                  type="button"
                  className="tag-input__dot"
                  style={{ backgroundColor: getTagColor(tag) }}
                  onClick={(e) => handleDotClick(e, tag)}
                  title="Change color"
                />
                {colorPickerTag === tag && (
                  <TagColorPicker
                    currentColor={getTagColor(tag)}
                    onSelect={(color) => {
                      onUpdateTagColor(tag, color)
                      setColorPickerTag(null)
                    }}
                    onClose={() => setColorPickerTag(null)}
                  />
                )}
              </span>
              <span className="tag-input__pill-name">{tag}</span>
              <button
                type="button"
                className="tag-input__remove"
                onClick={() => onRemoveTag(tag)}
                title="Remove tag"
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Text input */}
      <div className="tag-input__field">
        <input
          ref={inputRef}
          type="text"
          className="edit-form__input tag-input__text"
          placeholder="Add tag..."
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value)
            setShowDropdown(true)
          }}
          onFocus={() => setShowDropdown(true)}
          onKeyDown={handleKeyDown}
          autoComplete="off"
        />

        {/* Autocomplete dropdown */}
        {showDropdown && (suggestions.length > 0 || showCreateOption) && (
          <div className="tag-input__dropdown">
            {suggestions.map((name) => (
              <button
                key={name}
                type="button"
                className="tag-input__suggestion"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleAddTag(name)}
              >
                <span
                  className="tag-input__suggestion-dot"
                  style={{ backgroundColor: getTagColor(name) }}
                />
                {name}
              </button>
            ))}
            {showCreateOption && (
              <button
                type="button"
                className="tag-input__suggestion tag-input__suggestion--create"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleAddTag(trimmedInput)}
              >
                Create &ldquo;{trimmedInput}&rdquo;
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default TagInput
