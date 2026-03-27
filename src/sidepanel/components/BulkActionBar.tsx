import './BulkActionBar.css'

interface BulkActionBarProps {
  selectedCount: number
  totalCount: number
  onSelectAll: () => void
  onDeselectAll: () => void
  onDelete: () => void
  onTag: () => void
  onAddToList: () => void
  onToggleNotifications: () => void
  onCancel: () => void
}

const BulkActionBar: React.FC<BulkActionBarProps> = ({
  selectedCount,
  totalCount,
  onSelectAll,
  onDeselectAll,
  onDelete,
  onTag,
  onAddToList,
  onToggleNotifications,
  onCancel,
}) => {
  const allSelected = selectedCount === totalCount && totalCount > 0

  return (
    <div className="bulk-bar">
      <div className="bulk-bar__top">
        <span className="bulk-bar__count">{selectedCount} selected</span>
        <button
          className="bulk-bar__select-toggle"
          onClick={allSelected ? onDeselectAll : onSelectAll}
        >
          {allSelected ? 'Deselect All' : 'Select All'}
        </button>
      </div>
      <div className="bulk-bar__actions">
        <button className="bulk-bar__btn bulk-bar__btn--delete" onClick={onDelete} disabled={selectedCount === 0} title="Delete selected">
          Delete
        </button>
        <button className="bulk-bar__btn" onClick={onTag} disabled={selectedCount === 0} title="Tag selected">
          Tag
        </button>
        <button className="bulk-bar__btn" onClick={onAddToList} disabled={selectedCount === 0} title="Add to list">
          Add to List
        </button>
        <button className="bulk-bar__btn" onClick={onToggleNotifications} disabled={selectedCount === 0} title="Toggle notifications">
          Notifications
        </button>
        <button className="bulk-bar__btn bulk-bar__btn--cancel" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}

export default BulkActionBar
