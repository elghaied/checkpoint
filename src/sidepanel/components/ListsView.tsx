import { useState, useRef, useEffect, useCallback } from 'react'
import type { CustomList, TrackedItem } from '@/shared/types'
import { applyFilters } from '@/shared/filterEngine'
import './ListsView.css'

interface ListsViewProps {
  lists: CustomList[]
  allItems: TrackedItem[]
  onOpenList: (list: CustomList) => void
  onCreateList: () => void
  onRenameList: (id: string, name: string) => void
  onDeleteList: (id: string) => void
}

function getListItemCount(list: CustomList, allItems: TrackedItem[]): number {
  if (list.type === 'manual') {
    return list.itemIds.length
  }
  // Smart list: compute via filter engine
  if (!list.filters) return 0
  return applyFilters(allItems, {
    formats: list.filters.formats,
    genres: list.filters.genres,
    tags: list.filters.tags,
  }).length
}

const ListsView: React.FC<ListsViewProps> = ({
  lists,
  allItems,
  onOpenList,
  onCreateList,
  onRenameList,
  onDeleteList,
}) => {
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)

  // Only focus/select when a NEW rename starts, not on every keystroke
  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus()
      renameInputRef.current.select()
    }
  }, [renamingId])

  const handleRenameSubmit = useCallback((id: string) => {
    if (!renamingId) return
    const trimmed = renameValue.trim()
    if (trimmed) {
      onRenameList(id, trimmed)
    }
    setRenamingId(null)
    setRenameValue('')
  }, [renamingId, renameValue, onRenameList])

  const handleDeleteClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (confirmingDelete === id) {
      onDeleteList(id)
      setConfirmingDelete(null)
    } else {
      setConfirmingDelete(id)
    }
  }

  const handleRowClick = (list: CustomList) => {
    if (renamingId === list.id) return
    setConfirmingDelete(null)
    onOpenList(list)
  }

  return (
    <div className="lists-view">
      <div className="lists-view__header">
        <h2 className="lists-view__title">My Lists</h2>
        <button className="btn btn--secondary lists-view__new-btn" onClick={onCreateList}>
          + New List
        </button>
      </div>

      {lists.length === 0 ? (
        <div className="lists-view__empty">
          <p>No lists yet. Create one to organize your reading.</p>
        </div>
      ) : (
        <ul className="lists-view__list">
          {lists.map((list) => {
            const count = getListItemCount(list, allItems)
            const isRenaming = renamingId === list.id
            const isConfirmingDelete = confirmingDelete === list.id

            return (
              <li
                key={list.id}
                className="lists-view__item"
                onClick={() => handleRowClick(list)}
              >
                <div className="lists-view__item-icon">
                  {list.type === 'smart' ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-label="Smart list">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-label="Manual list">
                      <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/>
                    </svg>
                  )}
                </div>

                <div className="lists-view__item-body" onClick={(e) => e.stopPropagation()}>
                  {isRenaming ? (
                    <input
                      ref={renameInputRef}
                      className="lists-view__rename-input"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => handleRenameSubmit(list.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRenameSubmit(list.id)
                        if (e.key === 'Escape') { setRenamingId(null); setRenameValue('') }
                      }}
                    />
                  ) : (
                    <span
                      className="lists-view__item-name"
                      onClick={(e) => {
                        e.stopPropagation()
                        setRenamingId(list.id)
                        setRenameValue(list.name)
                        setConfirmingDelete(null)
                      }}
                      title="Click to rename"
                    >
                      {list.name}
                    </span>
                  )}
                  <span className="lists-view__item-count">
                    {count} {count === 1 ? 'item' : 'items'}
                  </span>
                </div>

                <div className="lists-view__item-actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    className={`lists-view__delete-btn${isConfirmingDelete ? ' lists-view__delete-btn--confirm' : ''}`}
                    onClick={(e) => handleDeleteClick(e, list.id)}
                    title={isConfirmingDelete ? 'Confirm delete' : 'Delete list'}
                  >
                    {isConfirmingDelete ? 'Confirm?' : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                      </svg>
                    )}
                  </button>
                  <button
                    className="lists-view__open-btn"
                    onClick={(e) => { e.stopPropagation(); handleRowClick(list) }}
                    title="Open list"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
                    </svg>
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export default ListsView
