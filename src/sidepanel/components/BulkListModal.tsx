import type { CustomList } from '@/shared/types'
import './BulkListModal.css'

interface BulkListModalProps {
  lists: CustomList[]
  onSelect: (listId: string) => void
  onClose: () => void
}

const BulkListModal: React.FC<BulkListModalProps> = ({ lists, onSelect, onClose }) => {
  const manualLists = lists.filter((l) => l.type === 'manual')

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal bulk-list-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h2>Add to List</h2>
        </div>
        <div className="modal__body">
          {manualLists.length === 0 ? (
            <p className="bulk-list-modal__empty">No lists available. Create a list first.</p>
          ) : (
            <div className="bulk-list-modal__options">
              {manualLists.map((list) => (
                <button
                  key={list.id}
                  className="bulk-list-modal__option"
                  onClick={() => onSelect(list.id)}
                >
                  <span className="bulk-list-modal__name">{list.name}</span>
                  <span className="bulk-list-modal__count">{list.itemIds.length} items</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="modal__actions">
          <button className="btn btn--secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

export default BulkListModal
