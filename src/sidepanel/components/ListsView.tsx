import { useState, useRef, useEffect, useCallback } from 'react'
import type { CustomList, CustomTagRegistry, TrackedItem } from '@/shared/types'
import { applyFilters } from '@/shared/filterEngine'
import { searchListsFlat, ancestorIds, descendantIds, depthOf } from '@/shared/listTree'
import { MAX_LIST_NESTING_DEPTH } from '@/shared/constants'
import FolderItems from './FolderItems'
import './ListsView.css'

interface ListsViewProps {
  lists: CustomList[]
  allItems: TrackedItem[]
  currentListId: string | null
  onNavigate: (id: string | null) => void
  onCreateList: (parentId: string | null) => void
  onRenameList: (id: string, name: string) => void
  onDeleteList: (id: string) => void
  onMoveList: (list: CustomList) => void
  onAddItems: () => void
  onEditFilters: (list: CustomList) => void
  onRemoveItem: (providerId: string) => void
  onItemEdit: (item: TrackedItem) => void
  tagRegistry?: CustomTagRegistry
}

function getListItemCount(list: CustomList, allItems: TrackedItem[]): number {
  if (list.type === 'manual') return list.itemIds.length
  if (!list.filters) return 0
  return applyFilters(allItems, {
    formats: list.filters.formats,
    genres: list.filters.genres,
    tags: list.filters.tags,
  }).length
}

function renderNameWithHighlight(name: string, query: string): React.ReactNode {
  const trimmed = query.trim()
  if (trimmed === '') return name
  const idx = name.toLowerCase().indexOf(trimmed.toLowerCase())
  if (idx === -1) return name
  return (
    <>
      {name.slice(0, idx)}
      <mark className="lists-view__highlight">{name.slice(idx, idx + trimmed.length)}</mark>
      {name.slice(idx + trimmed.length)}
    </>
  )
}

const FolderIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-label="List">
    <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
  </svg>
)

const SmartIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-label="Smart list">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
  </svg>
)

const ListsView: React.FC<ListsViewProps> = ({
  lists,
  allItems,
  currentListId,
  onNavigate,
  onCreateList,
  onRenameList,
  onDeleteList,
  onMoveList,
  onAddItems,
  onEditFilters,
  onRemoveItem,
  onItemEdit,
  tagRegistry,
}) => {
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null)
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)

  const currentList = currentListId ? lists.find((l) => l.id === currentListId) ?? null : null
  const childLists = lists
    .filter((l) => l.parentId === currentListId)
    .sort((a, b) => a.name.localeCompare(b.name))
  const isSearchActive = searchQuery.trim() !== ''

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus()
      renameInputRef.current.select()
    }
  }, [renamingId])

  useEffect(() => {
    if (menuOpenFor === null) return
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.lists-view__overflow')) {
        setMenuOpenFor(null)
        setConfirmingDelete(null)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [menuOpenFor])

  const handleRenameSubmit = useCallback((id: string) => {
    const trimmed = renameValue.trim()
    if (trimmed) onRenameList(id, trimmed)
    setRenamingId(null)
    setRenameValue('')
  }, [renameValue, onRenameList])

  const handleDeleteClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (confirmingDelete === id) {
      onDeleteList(id)
      setConfirmingDelete(null)
      setMenuOpenFor(null)
    } else {
      setConfirmingDelete(id)
    }
  }

  function renderFolderRow(list: CustomList): React.ReactNode {
    const count = getListItemCount(list, allItems)
    const isRenaming = renamingId === list.id
    const isConfirmingDelete = confirmingDelete === list.id
    const descendantCount = descendantIds(list.id, lists).length

    return (
      <li
        key={list.id}
        className="lists-view__item"
        onClick={() => {
          if (renamingId === list.id) return
          setConfirmingDelete(null)
          onNavigate(list.id)
        }}
      >
        <div className="lists-view__item-icon">
          {list.type === 'smart' ? <SmartIcon /> : <FolderIcon />}
        </div>

        <div className="lists-view__item-body">
          {isRenaming ? (
            <input
              ref={renameInputRef}
              className="lists-view__rename-input"
              value={renameValue}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={() => handleRenameSubmit(list.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRenameSubmit(list.id)
                if (e.key === 'Escape') { setRenamingId(null); setRenameValue('') }
              }}
            />
          ) : (
            <span className="lists-view__item-name">{list.name}</span>
          )}
          <span className="lists-view__item-count">
            {count} {count === 1 ? 'item' : 'items'}
          </span>
        </div>

        <div className="lists-view__item-actions" onClick={(e) => e.stopPropagation()}>
          <div className="lists-view__overflow">
            <button
              type="button"
              className="lists-view__overflow-btn"
              onClick={() => {
                setConfirmingDelete(null)
                setMenuOpenFor(menuOpenFor === list.id ? null : list.id)
              }}
              aria-label="More actions"
              aria-haspopup="menu"
              aria-expanded={menuOpenFor === list.id}
            >
              ⋮
            </button>
            {menuOpenFor === list.id && (
              <div className="lists-view__overflow-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  className="lists-view__overflow-item"
                  onClick={() => {
                    setMenuOpenFor(null)
                    setRenamingId(list.id)
                    setRenameValue(list.name)
                    setConfirmingDelete(null)
                  }}
                >
                  Rename
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="lists-view__overflow-item"
                  onClick={() => { setMenuOpenFor(null); onMoveList(list) }}
                >
                  Move to…
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={`lists-view__overflow-item lists-view__overflow-item--danger${isConfirmingDelete ? ' lists-view__overflow-item--confirm' : ''}`}
                  onClick={(e) => handleDeleteClick(e, list.id)}
                >
                  {isConfirmingDelete
                    ? (descendantCount > 0 ? `Delete & ${descendantCount} sub?` : 'Confirm delete?')
                    : 'Delete'}
                </button>
              </div>
            )}
          </div>
        </div>
      </li>
    )
  }

  const searchBar = (
    <div className="lists-view__search">
      <input
        type="text"
        className="lists-view__search-input"
        placeholder="Search lists…"
        aria-label="Search lists"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />
      {isSearchActive && (
        <button
          type="button"
          className="lists-view__search-clear"
          onClick={() => setSearchQuery('')}
          aria-label="Clear search"
        >
          ×
        </button>
      )}
    </div>
  )

  if (isSearchActive) {
    const results = searchListsFlat(lists, searchQuery)
    return (
      <div className="lists-view">
        {searchBar}
        {results.length === 0 ? (
          <div className="lists-view__empty">
            <p>No lists matching &ldquo;{searchQuery}&rdquo;.</p>
          </div>
        ) : (
          <ul className="lists-view__list">
            {results.map(({ list, path }) => (
              <li
                key={list.id}
                className="lists-view__item"
                onClick={() => { onNavigate(list.id); setSearchQuery('') }}
              >
                <div className="lists-view__item-icon">
                  {list.type === 'smart' ? <SmartIcon /> : <FolderIcon />}
                </div>
                <div className="lists-view__item-body">
                  <span className="lists-view__item-name">
                    {renderNameWithHighlight(list.name, searchQuery)}
                  </span>
                  {path && <span className="lists-view__item-path">{path}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  const breadcrumb = currentList ? (
    <nav className="lists-view__breadcrumb">
      {[
        { id: null as string | null, name: 'My Lists' },
        ...ancestorIds(currentList.id, lists)
          .slice()
          .reverse()
          .map((aid) => {
            const a = lists.find((l) => l.id === aid)
            return a ? { id: a.id as string | null, name: a.name } : null
          })
          .filter((c): c is { id: string | null; name: string } => c !== null),
        { id: currentList.id as string | null, name: currentList.name },
      ].map((crumb, i, arr) => {
        const isLast = i === arr.length - 1
        return (
          <span key={crumb.id ?? 'root'} className="lists-view__crumb-wrap">
            {isLast ? (
              <span className="lists-view__crumb lists-view__crumb--current">{crumb.name}</span>
            ) : (
              <button
                type="button"
                className="lists-view__crumb"
                onClick={() => onNavigate(crumb.id)}
              >
                {crumb.name}
              </button>
            )}
            {!isLast && <span className="lists-view__crumb-sep">/</span>}
          </span>
        )
      })}
    </nav>
  ) : null

  const canAddSubList =
    currentList?.type === 'manual' &&
    depthOf(currentList.id, lists) < MAX_LIST_NESTING_DEPTH - 1

  const currentItemCount = currentList ? getListItemCount(currentList, allItems) : 0
  const showEmpty = childLists.length === 0 && currentItemCount === 0

  return (
    <div className="lists-view">
      {searchBar}
      {breadcrumb}

      <div className="lists-view__header">
        <h2 className="lists-view__title">{currentList ? currentList.name : 'My Lists'}</h2>
        <div className="lists-view__header-actions">
          {currentList === null && (
            <button className="btn btn--secondary lists-view__new-btn" onClick={() => onCreateList(null)}>
              + New List
            </button>
          )}
          {currentList?.type === 'manual' && (
            <>
              {canAddSubList && (
                <button className="btn btn--secondary lists-view__new-btn" onClick={() => onCreateList(currentList.id)}>
                  + Sub-list
                </button>
              )}
              <button className="btn btn--secondary lists-view__new-btn" onClick={onAddItems}>
                + Add Items
              </button>
            </>
          )}
          {currentList?.type === 'smart' && (
            <button className="btn btn--secondary lists-view__new-btn" onClick={() => onEditFilters(currentList)}>
              Edit Filters
            </button>
          )}
        </div>
      </div>

      {showEmpty ? (
        <div className="lists-view__empty">
          {currentList === null ? (
            <p>No lists yet. Create one to organize your reading.</p>
          ) : currentList.type === 'smart' ? (
            <p>No items match this list&apos;s filters.</p>
          ) : (
            <p>This list is empty. Add items or create a sub-list.</p>
          )}
        </div>
      ) : (
        <>
          {childLists.length > 0 && (
            <ul className="lists-view__list">
              {childLists.map((list) => renderFolderRow(list))}
            </ul>
          )}
          {currentList && (
            <FolderItems
              list={currentList}
              allItems={allItems}
              onRemoveItem={onRemoveItem}
              onItemEdit={onItemEdit}
              tagRegistry={tagRegistry}
            />
          )}
        </>
      )}
    </div>
  )
}

export default ListsView
