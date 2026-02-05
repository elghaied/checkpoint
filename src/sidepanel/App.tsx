import { useState } from 'react'
import type { TrackedItem } from '@/shared/types'
import Header from './components/Header'
import TabBar, { type TabValue } from './components/TabBar'
import ItemList from './components/ItemList'
import AddButton from './components/AddButton'
import SearchModal from './components/SearchModal'
import EditModal from './components/EditModal'
import SettingsPage from './components/SettingsPage'
import { useTrackedItems } from './hooks/useTrackedItems'
import { useAddItem } from './hooks/useAddItem'
import { deleteItem } from './services/messaging'

type View = 'list' | 'settings'

export default function App() {
  const [view, setView] = useState<View>('list')
  const [activeTab, setActiveTab] = useState<TabValue>('ALL')
  const { items, loading, refresh } = useTrackedItems(activeTab === 'ALL' ? undefined : activeTab)
  const addItem = useAddItem(refresh)
  const [editingItem, setEditingItem] = useState<TrackedItem | null>(null)

  const handleEdit = (item: TrackedItem) => {
    setEditingItem(item)
  }

  const handleSaveEdit = async (updates: Partial<TrackedItem>) => {
    if (!editingItem) return

    try {
      // Use the messaging service to update via background
      await chrome.runtime.sendMessage({
        type: 'UPDATE_ITEM',
        providerId: editingItem.providerId,
        updates,
      })
      setEditingItem(null)
      refresh()
    } catch (err) {
      console.error('Failed to save:', err)
    }
  }

  const handleDelete = async () => {
    if (!editingItem) return

    try {
      await deleteItem(editingItem.providerId)
      setEditingItem(null)
      refresh()
    } catch (err) {
      console.error('Failed to delete:', err)
    }
  }

  const handleOpen = (item: TrackedItem) => {
    if (item.lastUrl) {
      chrome.tabs.create({ url: item.lastUrl })
    }
  }

  const isAddLoading = ['extracting', 'searching', 'saving'].includes(addItem.status)

  // Settings page view
  if (view === 'settings') {
    return (
      <div className="app">
        <SettingsPage onBack={() => setView('list')} />
      </div>
    )
  }

  return (
    <div className="app">
      <Header onSettingsClick={() => setView('settings')} />
      <main className="main">
        <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
        <ItemList
          items={items}
          loading={loading}
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
      </main>
      <AddButton
        onClick={addItem.startAdd}
        loading={isAddLoading}
        disabled={isAddLoading}
      />
      {(addItem.status === 'selecting' || (addItem.status === 'searching' && addItem.searchResults !== null)) && (
        <SearchModal
          results={addItem.searchResults || []}
          originalTitle={addItem.originalExtractedTitle}
          isSearching={addItem.status === 'searching'}
          onSelect={addItem.selectResult}
          onSearch={addItem.searchManually}
          onCancel={addItem.cancelSelection}
        />
      )}
      {editingItem && (
        <EditModal
          item={editingItem}
          onSave={handleSaveEdit}
          onDelete={handleDelete}
          onClose={() => setEditingItem(null)}
        />
      )}
    </div>
  )
}
