import { useState } from 'react'
import type { TrackedItem } from '@/shared/types'

interface EditModalProps {
  item: TrackedItem
  onSave: (updates: Partial<TrackedItem>) => void
  onDelete: () => void
  onClose: () => void
}

const FORMATS: TrackedItem['format'][] = ['MANGA', 'MANHWA', 'MANHUA']

const EditModal: React.FC<EditModalProps> = ({ item, onSave, onDelete, onClose }) => {
  const [title, setTitle] = useState(item.titles.main)
  const [progressValue, setProgressValue] = useState(item.progress.value)
  const [format, setFormat] = useState<TrackedItem['format']>(item.format)
  const [altNames, setAltNames] = useState<string[]>(item.titles.alt)
  const [newAltName, setNewAltName] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const handleSave = () => {
    const updates: Partial<TrackedItem> = {}

    const titlesChanged = title !== item.titles.main || JSON.stringify(altNames) !== JSON.stringify(item.titles.alt)
    if (titlesChanged) {
      updates.titles = { main: title, alt: altNames }
    }

    if (progressValue !== item.progress.value) {
      updates.progress = { ...item.progress, value: progressValue }
    }

    if (format !== item.format) {
      updates.format = format
    }

    onSave(updates)
  }

  const handleAddAltName = () => {
    const trimmed = newAltName.trim()
    if (trimmed && !altNames.includes(trimmed)) {
      setAltNames([...altNames, trimmed])
      setNewAltName('')
    }
  }

  const handleRemoveAltName = (index: number) => {
    setAltNames(altNames.filter((_, i) => i !== index))
  }

  const handleDeleteClick = () => {
    if (confirmingDelete) {
      onDelete()
    } else {
      setConfirmingDelete(true)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h2>Edit</h2>
          <button className="modal__close" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="modal__body">
          <form className="edit-form" onSubmit={(e) => e.preventDefault()}>
            <div className="edit-form__field">
              <label className="edit-form__label" htmlFor="edit-title">
                Title
              </label>
              <input
                id="edit-title"
                className="edit-form__input"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="edit-form__field">
              <label className="edit-form__label" htmlFor="edit-progress">
                Progress
              </label>
              <input
                id="edit-progress"
                className="edit-form__input"
                type="text"
                value={progressValue}
                onChange={(e) => setProgressValue(e.target.value)}
              />
            </div>

            <div className="edit-form__field">
              <label className="edit-form__label" htmlFor="edit-format">
                Format
              </label>
              <select
                id="edit-format"
                className="edit-form__select"
                value={format}
                onChange={(e) => setFormat(e.target.value as TrackedItem['format'])}
              >
                {FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {f.charAt(0) + f.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>
            </div>

            <div className="edit-form__field">
              <label className="edit-form__label">Alternative Names</label>
              <div className="alt-names">
                {altNames.map((name, index) => (
                  <span key={index} className="alt-names__chip">
                    {name}
                    <button
                      type="button"
                      className="alt-names__remove"
                      onClick={() => handleRemoveAltName(index)}
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>
              <div className="alt-names__add">
                <input
                  type="text"
                  className="edit-form__input"
                  placeholder="Add alternative name..."
                  value={newAltName}
                  onChange={(e) => setNewAltName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleAddAltName()
                    }
                  }}
                />
                <button type="button" className="btn btn--secondary" onClick={handleAddAltName}>
                  Add
                </button>
              </div>
            </div>

            <div className="edit-form__actions">
              <button type="button" className="btn btn--danger" onClick={handleDeleteClick}>
                {confirmingDelete ? 'Confirm?' : 'Delete'}
              </button>
              <button type="button" className="btn btn--secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="button" className="btn btn--primary" onClick={handleSave}>
                Save
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default EditModal
