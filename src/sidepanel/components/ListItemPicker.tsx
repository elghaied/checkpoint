import { useState } from 'react'
import type { TrackedItem } from '@/shared/types'
import './ListItemPicker.css'

interface ListItemPickerProps {
  allItems: TrackedItem[]
  selectedIds: string[]
  onSave: (ids: string[]) => void
  onClose: () => void
}

const ListItemPicker: React.FC<ListItemPickerProps> = ({
  allItems,
  selectedIds,
  onSave,
  onClose,
}) => {
  const [checked, setChecked] = useState<Set<string>>(new Set(selectedIds))

  const toggle = (providerId: string) => {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(providerId)) {
        next.delete(providerId)
      } else {
        next.add(providerId)
      }
      return next
    })
  }

  const handleSave = () => {
    onSave(Array.from(checked))
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal list-item-picker" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h2>Add Items to List</h2>
          <button className="modal__close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal__body list-item-picker__body">
          {allItems.length === 0 ? (
            <p className="list-item-picker__empty">No tracked items yet.</p>
          ) : (
            <ul className="list-item-picker__list">
              {allItems.map((item) => (
                <li
                  key={item.providerId}
                  className={`list-item-picker__row${checked.has(item.providerId) ? ' list-item-picker__row--checked' : ''}`}
                  onClick={() => toggle(item.providerId)}
                >
                  <input
                    type="checkbox"
                    className="list-item-picker__checkbox"
                    checked={checked.has(item.providerId)}
                    onChange={() => toggle(item.providerId)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <img
                    className="list-item-picker__cover"
                    src={item.coverImage}
                    alt={item.titles.main}
                  />
                  <span className="list-item-picker__title">{item.titles.main}</span>
                  <span className="list-item-picker__format">
                    {item.format.charAt(0) + item.format.slice(1).toLowerCase()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="list-item-picker__footer">
          <button className="btn btn--secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn--primary" onClick={handleSave}>
            Save ({checked.size})
          </button>
        </div>
      </div>
    </div>
  )
}

export default ListItemPicker
