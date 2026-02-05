import type { TrackedItem } from '@/shared/types'
import ItemCard from './ItemCard'
import EmptyState from './EmptyState'

interface ItemListProps {
  items: TrackedItem[]
  loading: boolean
  onEdit: (item: TrackedItem) => void
  onOpen: (item: TrackedItem) => void
  onRefresh: () => void
}

const ItemList: React.FC<ItemListProps> = ({ items, loading, onEdit, onOpen, onRefresh }) => {
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
