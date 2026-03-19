import { useState } from 'react'
import { useCustomTags } from '../hooks/useCustomTags'
import TagColorPicker from './TagColorPicker'
import './TagsView.css'

const TagsView: React.FC = () => {
  const { tags, updateTag, deleteTag } = useCustomTags()

  const [renamingTag, setRenamingTag] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [colorPickerTag, setColorPickerTag] = useState<string | null>(null)
  const [deletingTag, setDeletingTag] = useState<string | null>(null)

  const tagCount = Object.keys(tags).length

  const handleRenameStart = (name: string) => {
    setRenamingTag(name)
    setRenameValue(name)
    setColorPickerTag(null)
    setDeletingTag(null)
  }

  const handleRenameCommit = async () => {
    if (!renamingTag) return
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== renamingTag) {
      await updateTag(renamingTag, { newName: trimmed })
    }
    setRenamingTag(null)
    setRenameValue('')
  }

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleRenameCommit()
    else if (e.key === 'Escape') {
      setRenamingTag(null)
      setRenameValue('')
    }
  }

  const handleColorSelect = async (name: string, color: string) => {
    await updateTag(name, { color })
    setColorPickerTag(null)
  }

  const handleDeleteRequest = (name: string) => {
    setDeletingTag(name)
    setColorPickerTag(null)
    setRenamingTag(null)
  }

  const handleDeleteConfirm = async (name: string) => {
    await deleteTag(name)
    setDeletingTag(null)
  }

  return (
    <div className="tags-view">
      <div className="tags-view__header">
        <h1 className="tags-view__title">Tags</h1>
        {tagCount > 0 && (
          <span className="tags-view__count">{tagCount} {tagCount === 1 ? 'tag' : 'tags'}</span>
        )}
      </div>

      <div className="tags-view__content">
        {tagCount === 0 ? (
          <div className="tags-view__empty">
            No tags created yet. Add tags from any item's edit screen.
          </div>
        ) : (
          <ul className="tags-list">
            {Object.entries(tags).map(([name, tag]) => (
              <li key={name} className="tag-row">
                <div className="tag-row__pill">
                  {/* Color dot — click to open picker */}
                  <div className="tag-row__color-wrap">
                    <button
                      type="button"
                      className="tag-row__color-dot"
                      style={{ backgroundColor: tag.color }}
                      onClick={() => setColorPickerTag(colorPickerTag === name ? null : name)}
                      aria-label={`Change color for ${name}`}
                    />
                    {colorPickerTag === name && (
                      <div className="tag-row__color-picker-wrap">
                        <TagColorPicker
                          currentColor={tag.color}
                          onSelect={(color) => handleColorSelect(name, color)}
                          onClose={() => setColorPickerTag(null)}
                        />
                      </div>
                    )}
                  </div>

                  {/* Tag name — click to rename */}
                  {renamingTag === name ? (
                    <input
                      className="tag-row__rename-input"
                      value={renameValue}
                      autoFocus
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={handleRenameCommit}
                      onKeyDown={handleRenameKeyDown}
                    />
                  ) : (
                    <button
                      type="button"
                      className="tag-row__name"
                      onClick={() => handleRenameStart(name)}
                      title="Click to rename"
                    >
                      {name}
                    </button>
                  )}
                </div>

                {/* Delete */}
                <div className="tag-row__actions">
                  {deletingTag === name ? (
                    <div className="tag-row__confirm">
                      <span className="tag-row__confirm-label">Delete?</span>
                      <button
                        type="button"
                        className="tag-row__confirm-btn tag-row__confirm-btn--yes"
                        onClick={() => handleDeleteConfirm(name)}
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        className="tag-row__confirm-btn tag-row__confirm-btn--no"
                        onClick={() => setDeletingTag(null)}
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="tag-row__delete"
                      onClick={() => handleDeleteRequest(name)}
                      aria-label={`Delete tag ${name}`}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                      </svg>
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export default TagsView
