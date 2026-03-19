import type { CustomList, TrackedItem } from '@/shared/types'
import { applyFilters } from '@/shared/filterEngine'
import ItemCard from './ItemCard'
import './ListDetail.css'

interface ListDetailProps {
  list: CustomList
  allItems: TrackedItem[]
  onBack: () => void
  onAddItems: () => void
  onEditFilters: () => void
  onRemoveItem: (providerId: string) => void
  onItemEdit: (item: TrackedItem) => void
}

function getListItems(list: CustomList, allItems: TrackedItem[]): TrackedItem[] {
  if (list.type === 'manual') {
    return list.itemIds
      .map((id) => allItems.find((item) => item.providerId === id))
      .filter((item): item is TrackedItem => item !== undefined)
  }
  // Smart list
  if (!list.filters) return []
  return applyFilters(allItems, {
    formats: list.filters.formats,
    genres: list.filters.genres,
    tags: list.filters.tags,
  })
}

const ListDetail: React.FC<ListDetailProps> = ({
  list,
  allItems,
  onBack,
  onAddItems,
  onEditFilters,
  onRemoveItem,
  onItemEdit,
}) => {
  const items = getListItems(list, allItems)

  const handleOpen = (item: TrackedItem) => {
    if (item.lastUrl) {
      chrome.tabs.create({ url: item.lastUrl })
    }
  }

  return (
    <div className="list-detail">
      <div className="list-detail__header">
        <button className="list-detail__back-btn" onClick={onBack} title="Back to lists">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
          </svg>
        </button>
        <h2 className="list-detail__title">{list.name}</h2>
        <div className="list-detail__actions">
          {list.type === 'manual' ? (
            <button className="btn btn--secondary list-detail__action-btn" onClick={onAddItems}>
              + Add Items
            </button>
          ) : (
            <button className="btn btn--secondary list-detail__action-btn" onClick={onEditFilters}>
              Edit Filters
            </button>
          )}
        </div>
      </div>

      <div className="list-detail__count">
        {items.length} {items.length === 1 ? 'item' : 'items'}
      </div>

      {items.length === 0 ? (
        <div className="list-detail__empty">
          {list.type === 'manual' ? (
            <p>No items in this list yet. Click &ldquo;+ Add Items&rdquo; to add some.</p>
          ) : (
            <p>No items match this list&apos;s filters.</p>
          )}
        </div>
      ) : (
        <div className="list-detail__items">
          {items.map((item, idx) => (
            <div key={item.providerId} className="list-detail__card-wrap">
              <ItemCard
                item={item}
                index={idx}
                onEdit={() => onItemEdit(item)}
                onOpen={() => handleOpen(item)}
              />
              {list.type === 'manual' && (
                <button
                  className="list-detail__remove-btn"
                  onClick={() => onRemoveItem(item.providerId)}
                  title="Remove from list"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                  </svg>
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default ListDetail
