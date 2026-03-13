import { useState, useMemo, useEffect } from 'react'
import type { TrackedItem } from '@/shared/types'
import ErrorBoundary from './components/ErrorBoundary'
import Header from './components/Header'
import TabBar, { type TabValue } from './components/TabBar'
import SearchBar from './components/SearchBar'
import ItemList from './components/ItemList'
import AddButton from './components/AddButton'
import SearchModal from './components/SearchModal'
import EditModal from './components/EditModal'
import SettingsPage from './components/SettingsPage'
import { useTrackedItems } from './hooks/useTrackedItems'
import { useAddItem } from './hooks/useAddItem'
import { deleteItem, ping } from './services/messaging'
import { createLogger } from '@/shared/logger'

const log = createLogger('app')

type View = 'list' | 'settings'

export default function App() {
  const [view, setView] = useState<View>('list')
  const [activeTab, setActiveTab] = useState<TabValue>('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const { items, loading, error, refresh } = useTrackedItems(activeTab === 'ALL' ? undefined : activeTab)
  const addItem = useAddItem(refresh)
  const [editingItem, setEditingItem] = useState<TrackedItem | null>(null)

  useEffect(() => {
    ping().catch(() => {
      setConnectionError('Extension service worker is not responding. Try reloading the extension.')
    })
  }, [])

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items
    const q = searchQuery.toLowerCase().trim()
    return items.filter((item) => {
      const allTitles = [item.titles.main, ...item.titles.alt]
      return allTitles.some((t) => t.toLowerCase().includes(q))
    })
  }, [items, searchQuery])

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
      log.error('Failed to save:', err)
    }
  }

  const handleDelete = async () => {
    if (!editingItem) return

    try {
      await deleteItem(editingItem.providerId)
      setEditingItem(null)
      refresh()
    } catch (err) {
      log.error('Failed to delete:', err)
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
      <ErrorBoundary>
        <div className="app">
          <SettingsPage onBack={() => setView('list')} />
        </div>
      </ErrorBoundary>
    )
  }

  return (
    <ErrorBoundary>
    <div className="app">
      <Header onSettingsClick={() => setView('settings')} />
      {connectionError && (
        <div className="connection-banner">{connectionError}</div>
      )}
      <main className="main">
        <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
        <SearchBar value={searchQuery} onChange={setSearchQuery} />
        <ItemList
          items={filteredItems}
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
