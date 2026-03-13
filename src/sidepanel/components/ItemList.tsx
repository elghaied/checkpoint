import type { TrackedItem } from '@/shared/types'
import ItemCard from './ItemCard'
import EmptyState from './EmptyState'

interface ItemListProps {
  items: TrackedItem[]
  loading: boolean
  error?: string | null
  onRetry?: () => void
  onEdit: (item: TrackedItem) => void
  onOpen: (item: TrackedItem) => void
  onRefresh: () => void
}

const ItemList: React.FC<ItemListProps> = ({ items, loading, error, onRetry, onEdit, onOpen, onRefresh }) => {
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
      <div className="item-list item-list--loading">
        <p>Loading...</p>
      </div>
    )
  }

  if (items.length === 0) {
    return <EmptyState />
  }

  return (
    <div className="item-list">
      {items.map((item) => (
        <ItemCard
          key={item.providerId}
          item={item}
          onEdit={() => onEdit(item)}
          onOpen={() => onOpen(item)}
          onToggleNotifications={() => onRefresh()}
        />
      ))}
    </div>
  )
}

export default ItemList
