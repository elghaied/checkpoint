import type { TrackedItem } from '@/shared/types'
import ItemCard from './ItemCard'
import EmptyState from './EmptyState'
import './ItemList.css'

interface ItemListProps {
  items: TrackedItem[]
  loading: boolean
  error?: string | null
  onRetry?: () => void
  onEdit: (item: TrackedItem) => void
  onOpen: (item: TrackedItem) => void
  onRefresh: () => void
  onTogglePin?: (item: TrackedItem) => void
  selectionMode?: boolean
  selectedIds?: Set<string>
  onSelect?: (providerId: string) => void
}

const ItemList: React.FC<ItemListProps> = ({ items, loading, error, onRetry, onEdit, onOpen, onRefresh, onTogglePin, selectionMode, selectedIds, onSelect }) => {
  if (error) {
    return (
      <div className="error-state">
        <p>Failed to load items</p>
        <p className="error-state__detail">{error}</p>
        {onRetry && <button className="btn btn--primary" onClick={onRetry}>Try Again</button>}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="item-list">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton-card">
            <div className="skeleton-card__cover" />
            <div className="skeleton-card__lines">
              <div className="skeleton-card__text" style={{ width: '70%' }} />
              <div className="skeleton-card__text" style={{ width: '50%' }} />
              <div className="skeleton-card__text" style={{ width: '40%' }} />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (items.length === 0) {
    return <EmptyState />
  }

  return (
    <div className="item-list">
      {items.map((item, idx) => (
        <ItemCard
          key={item.providerId}
          item={item}
          index={idx}
          onEdit={() => onEdit(item)}
          onOpen={() => onOpen(item)}
          onToggleNotifications={onRefresh}
          onTogglePin={onTogglePin ? () => onTogglePin(item) : undefined}
          selectionMode={selectionMode}
          selected={selectedIds?.has(item.providerId)}
          onSelect={() => onSelect?.(item.providerId)}
        />
      ))}
    </div>
  )
}

export default ItemList
