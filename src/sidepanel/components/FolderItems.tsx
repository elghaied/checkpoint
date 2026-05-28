import type { CustomList, CustomTagRegistry, TrackedItem } from '@/shared/types'
import { applyFilters } from '@/shared/filterEngine'
import ItemCard from './ItemCard'
import './FolderItems.css'

interface FolderItemsProps {
  list: CustomList
  allItems: TrackedItem[]
  onRemoveItem: (providerId: string) => void
  onItemEdit: (item: TrackedItem) => void
  tagRegistry?: CustomTagRegistry
}

function getListItems(list: CustomList, allItems: TrackedItem[]): TrackedItem[] {
  if (list.type === 'manual') {
    return list.itemIds
      .map((id) => allItems.find((item) => item.providerId === id))
      .filter((item): item is TrackedItem => item !== undefined)
  }
  if (!list.filters) return []
  return applyFilters(allItems, {
    formats: list.filters.formats,
    genres: list.filters.genres,
    tags: list.filters.tags,
  })
}

const FolderItems: React.FC<FolderItemsProps> = ({
  list,
  allItems,
  onRemoveItem,
  onItemEdit,
  tagRegistry,
}) => {
  const items = getListItems(list, allItems)

  const handleOpen = (item: TrackedItem) => {
    if (item.lastUrl) {
      chrome.tabs.create({ url: item.lastUrl })
    }
  }

  if (items.length === 0) return null

  return (
    <div className="folder-items">
      {items.map((item, idx) => (
        <div key={item.providerId} className="folder-items__card-wrap">
          <ItemCard
            item={item}
            index={idx}
            onEdit={() => onItemEdit(item)}
            onOpen={() => handleOpen(item)}
            tagRegistry={tagRegistry}
          />
          {list.type === 'manual' && (
            <button
              type="button"
              className="folder-items__remove-btn"
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
  )
}

export default FolderItems
