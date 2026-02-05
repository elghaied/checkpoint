import { TrackedItem } from '@/shared/types'

interface ItemCardProps {
  item: TrackedItem
  onEdit: () => void
  onOpen: () => void
}

function formatUpdatedAt(timestamp: number): string {
  const now = Date.now()
  const diffMs = now - timestamp
  const diffMins = Math.floor(diffMs / 60_000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`

  return new Date(timestamp).toLocaleDateString()
}

const ItemCard: React.FC<ItemCardProps> = ({ item, onEdit, onOpen }) => {
  const progressLabel =
    item.progress.unit === 'chapter'
      ? `Chapter ${item.progress.value}`
      : `Episode ${item.progress.value}`

  return (
    <div className="item-card">
      <img
        className="item-card__cover"
        src={item.coverImage}
        alt={`Cover for ${item.titles.main}`}
      />
      <div className="item-card__info">
        <h3 className="item-card__title">{item.titles.main}</h3>
        <p className="item-card__progress">{progressLabel}</p>
        <p className="item-card__updated">{formatUpdatedAt(item.updatedAt)}</p>
        <div className="item-card__actions">
          <button className="item-card__btn item-card__btn--edit" onClick={onEdit}>
            Edit
          </button>
          <button className="item-card__btn item-card__btn--open" onClick={onOpen}>
            Open
          </button>
        </div>
      </div>
    </div>
  )
}

export default ItemCard
