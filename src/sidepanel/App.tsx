import { useState, useMemo, useEffect } from 'react'
import type { TrackedItem, CustomList } from '@/shared/types'
import ErrorBoundary from './components/ErrorBoundary'
import Header from './components/Header'
import TabBar, { type TabValue } from './components/TabBar'
import SearchBar from './components/SearchBar'
import ItemList from './components/ItemList'
import AddButton from './components/AddButton'
import SearchModal from './components/SearchModal'
import EditModal from './components/EditModal'
import SettingsPage from './components/SettingsPage'
import ListsView from './components/ListsView'
import ListDetail from './components/ListDetail'
import ListItemPicker from './components/ListItemPicker'
import { useTrackedItems } from './hooks/useTrackedItems'
import { useAddItem } from './hooks/useAddItem'
import { useCustomLists } from './hooks/useCustomLists'
import { deleteItem, updateItem, ping } from './services/messaging'
import { createLogger } from '@/shared/logger'

const log = createLogger('app')

type View = 'list' | 'settings' | 'lists'

export default function App() {
  const [view, setView] = useState<View>('list')
  const [activeTab, setActiveTab] = useState<TabValue>('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const { items, loading, error, refresh } = useTrackedItems()
  const addItem = useAddItem(refresh)
  const [editingItem, setEditingItem] = useState<TrackedItem | null>(null)
  const [pendingDelete, setPendingDelete] = useState<{
    item: TrackedItem
    timeoutId: number
  } | null>(null)

  // Lists state
  const { lists, refresh: refreshLists, createList, updateList, deleteList } = useCustomLists()
  const [selectedList, setSelectedList] = useState<CustomList | null>(null)
  const [showItemPicker, setShowItemPicker] = useState(false)

  useEffect(() => {
    ping().catch(() => {
      setConnectionError('Extension service worker is not responding. Try reloading the extension.')
    })
  }, [])

  const tabCounts = useMemo(() => ({
    ALL: items.length,
    MANGA: items.filter((i) => i.format === 'MANGA').length,
    MANHWA: items.filter((i) => i.format === 'MANHWA').length,
    MANHUA: items.filter((i) => i.format === 'MANHUA').length,
  }), [items])

  const filteredItems = useMemo(() => {
    const tabFiltered = activeTab === 'ALL' ? items : items.filter((i) => i.format === activeTab)
    if (!searchQuery.trim()) return tabFiltered
    const q = searchQuery.toLowerCase().trim()
    return tabFiltered.filter((item) => {
      const allTitles = [item.titles.main, ...item.titles.alt]
      return allTitles.some((t) => t.toLowerCase().includes(q))
    })
  }, [items, activeTab, searchQuery])

  const displayItems = useMemo(() => {
    if (!pendingDelete) return filteredItems
    return filteredItems.filter((item) => item.providerId !== pendingDelete.item.providerId)
  }, [filteredItems, pendingDelete])

  const handleEdit = (item: TrackedItem) => {
    setEditingItem(item)
  }

  const handleSaveEdit = async (updates: Partial<TrackedItem>) => {
    if (!editingItem) return

    try {
      await updateItem(editingItem.providerId, updates)
      setEditingItem(null)
      refresh()
    } catch (err) {
      log.error('Failed to save:', err)
    }
  }

  const handleDelete = async () => {
    if (!editingItem) return

    // Execute any pending delete first
    if (pendingDelete) {
      clearTimeout(pendingDelete.timeoutId)
      try {
        await deleteItem(pendingDelete.item.providerId)
      } catch (err) {
        log.error('Failed to delete:', err)
      }
    }

    const itemToDelete = editingItem
    setEditingItem(null)

    const timeoutId = window.setTimeout(async () => {
      try {
        await deleteItem(itemToDelete.providerId)
        setPendingDelete(null)
        refresh()
      } catch (err) {
        log.error('Failed to delete:', err)
        setPendingDelete(null)
      }
    }, 5000)

    setPendingDelete({ item: itemToDelete, timeoutId })
  }

  const handleUndo = () => {
    if (!pendingDelete) return
    clearTimeout(pendingDelete.timeoutId)
    setPendingDelete(null)
  }

  const handleOpen = (item: TrackedItem) => {
    if (item.lastUrl) {
      chrome.tabs.create({ url: item.lastUrl })
    }
  }

  // ---- List handlers ----

  const handleCreateList = async () => {
    const name = `List ${lists.length + 1}`
    await createList({ name, type: 'manual', itemIds: [], filters: null })
  }

  const handleRenameList = async (id: string, name: string) => {
    await updateList(id, { name })
  }

  const handleDeleteList = async (id: string) => {
    await deleteList(id)
    if (selectedList?.id === id) {
      setSelectedList(null)
    }
  }

  const handleOpenList = (list: CustomList) => {
    setSelectedList(list)
  }

  const handleListBack = () => {
    setSelectedList(null)
    refreshLists()
  }

  const handleAddItemsToList = () => {
    setShowItemPicker(true)
  }

  const handleItemPickerSave = async (ids: string[]) => {
    if (!selectedList) return
    await updateList(selectedList.id, { itemIds: ids })
    // Update selectedList reference so ListDetail re-renders with new items
    const updated = lists.find((l) => l.id === selectedList.id)
    if (updated) {
      setSelectedList({ ...updated, itemIds: ids })
    }
    setShowItemPicker(false)
  }

  const handleRemoveItemFromList = async (providerId: string) => {
    if (!selectedList) return
    const newIds = selectedList.itemIds.filter((id) => id !== providerId)
    await updateList(selectedList.id, { itemIds: newIds })
    setSelectedList((prev) => prev ? { ...prev, itemIds: newIds } : null)
  }

  const isAddLoading = ['extracting', 'searching', 'saving'].includes(addItem.status)

  // Settings page view
  if (view === 'settings') {
    return (
      <ErrorBoundary>
        <div className="app">
          <SettingsPage onBack={() => setView('list')} />
        </div>
      </ErrorBoundary>
    )
  }

  // Lists view
  if (view === 'lists') {
    return (
      <ErrorBoundary>
        <div className="app">
          <Header
            onSettingsClick={() => setView('settings')}
            onListsClick={() => { setView('list'); setSelectedList(null) }}
            count={items.length}
          />
          {selectedList ? (
            <ListDetail
              list={selectedList}
              allItems={items}
              onBack={handleListBack}
              onAddItems={handleAddItemsToList}
              onEditFilters={() => { /* placeholder for Task 12 */ }}
              onRemoveItem={handleRemoveItemFromList}
              onItemEdit={handleEdit}
            />
          ) : (
            <ListsView
              lists={lists}
              allItems={items}
              onOpenList={handleOpenList}
              onCreateList={handleCreateList}
              onRenameList={handleRenameList}
              onDeleteList={handleDeleteList}
            />
          )}

          {showItemPicker && selectedList && (
            <ListItemPicker
              allItems={items}
              selectedIds={selectedList.itemIds}
              onSave={handleItemPickerSave}
              onClose={() => setShowItemPicker(false)}
            />
          )}

          {editingItem && (
            <ErrorBoundary fallback={<div className="modal-error">Failed to load. <button onClick={() => setEditingItem(null)}>Close</button></div>}>
              <EditModal
                item={editingItem}
                onSave={handleSaveEdit}
                onDelete={handleDelete}
                onClose={() => setEditingItem(null)}
              />
            </ErrorBoundary>
          )}

          {pendingDelete && (
            <div className="toast toast--undo">
              <span>Deleted &ldquo;{pendingDelete.item.titles.main}&rdquo;</span>
              <button onClick={handleUndo}>Undo</button>
            </div>
          )}
        </div>
      </ErrorBoundary>
    )
  }

  return (
    <ErrorBoundary>
    <div className="app">
      <Header
        onSettingsClick={() => setView('settings')}
        onListsClick={() => setView('lists')}
        count={items.length}
      />
      {connectionError && (
        <div className="connection-banner">{connectionError}</div>
      )}
      <main className="main">
        <TabBar activeTab={activeTab} onTabChange={setActiveTab} counts={tabCounts} />
        <SearchBar value={searchQuery} onChange={setSearchQuery} />
        <ItemList
          key={activeTab}
          items={displayItems}
          loading={loading}
          error={error}
          onRetry={refresh}
          onEdit={handleEdit}
          onOpen={handleOpen}
          onRefresh={refresh}
        />
        {addItem.status === 'error' && (
          <div className="toast toast--error">
            {addItem.error}
            <button onClick={addItem.reset}>&times;</button>
          </div>
        )}
        {addItem.status === 'success' && (
          <div className="toast toast--success">
            Added successfully!
          </div>
        )}
        {pendingDelete && (
          <div className="toast toast--undo">
            <span>Deleted &ldquo;{pendingDelete.item.titles.main}&rdquo;</span>
            <button onClick={handleUndo}>Undo</button>
          </div>
        )}
      </main>
      <AddButton
        onClick={addItem.startAdd}
        loading={isAddLoading}
        disabled={isAddLoading}
      />
      {(addItem.status === 'selecting' || (addItem.status === 'searching' && addItem.searchResults !== null)) && (
        <ErrorBoundary fallback={<div className="modal-error">Failed to load. <button onClick={addItem.cancelSelection}>Close</button></div>}>
          <SearchModal
            results={addItem.searchResults || []}
            originalTitle={addItem.originalExtractedTitle}
            isSearching={addItem.status === 'searching'}
            onSelect={addItem.selectResult}
            onSearch={addItem.searchManually}
            onCancel={addItem.cancelSelection}
          />
        </ErrorBoundary>
      )}
      {editingItem && (
        <ErrorBoundary fallback={<div className="modal-error">Failed to load. <button onClick={() => setEditingItem(null)}>Close</button></div>}>
          <EditModal
            item={editingItem}
            onSave={handleSaveEdit}
            onDelete={handleDelete}
            onClose={() => setEditingItem(null)}
          />
        </ErrorBoundary>
      )}
    </div>
    </ErrorBoundary>
  )
}
