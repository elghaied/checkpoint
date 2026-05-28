import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import type { CustomList, TrackedItem } from '@/shared/types'
import { applyFilters } from '@/shared/filterEngine'
import { buildListTree, descendantIds, filterListTreeBySearch, type ListNode } from '@/shared/listTree'
import { MAX_LIST_NESTING_DEPTH } from '@/shared/constants'
import './ListsView.css'

interface ListsViewProps {
  lists: CustomList[]
  allItems: TrackedItem[]
  onOpenList: (list: CustomList) => void
  onCreateList: (parentId: string | null) => void
  onRenameList: (id: string, name: string) => void
  onDeleteList: (id: string) => void
  onMoveList: (list: CustomList) => void
}

function getListItemCount(list: CustomList, allItems: TrackedItem[]): number {
  if (list.type === 'manual') {
    return list.itemIds.length
  }
  if (!list.filters) return 0
  return applyFilters(allItems, {
    formats: list.filters.formats,
    genres: list.filters.genres,
    tags: list.filters.tags,
  }).length
}

const INDENT_PX_PER_LEVEL = 16

function renderNameWithHighlight(name: string, query: string): React.ReactNode {
  const trimmed = query.trim()
  if (trimmed === '') return name
  const lower = name.toLowerCase()
  const needle = trimmed.toLowerCase()
  const idx = lower.indexOf(needle)
  if (idx === -1) return name
  return (
    <>
      {name.slice(0, idx)}
      <mark className="lists-view__highlight">{name.slice(idx, idx + trimmed.length)}</mark>
      {name.slice(idx + trimmed.length)}
    </>
  )
}

const ListsView: React.FC<ListsViewProps> = ({
  lists,
  allItems,
  onOpenList,
  onCreateList,
  onRenameList,
  onDeleteList,
  onMoveList,
}) => {
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)

  const tree = useMemo(() => buildListTree(lists), [lists])

  const search = useMemo(
    () => filterListTreeBySearch(lists, searchQuery),
    [lists, searchQuery],
  )

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
    if (!renamingId) return
    const trimmed = renameValue.trim()
    if (trimmed) onRenameList(id, trimmed)
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

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function renderNode(node: ListNode): React.ReactNode {
    const { list, children, depth } = node
    if (isSearchActive && !search.visibleIds.has(list.id)) return null
    const count = getListItemCount(list, allItems)
    const isRenaming = renamingId === list.id
    const isConfirmingDelete = confirmingDelete === list.id
    const hasChildren = children.length > 0
    const isExpanded = isSearchActive
      ? search.autoExpandedIds.has(list.id) || expandedIds.has(list.id)
      : expandedIds.has(list.id)
    const descendantCount = descendantIds(list.id, lists).length
    const canAddSubList = list.type === 'manual' && depth < MAX_LIST_NESTING_DEPTH - 1

    return (
      <li
        key={list.id}
        className="lists-view__item"
        onClick={() => handleRowClick(list)}
        style={{ paddingLeft: `${depth * INDENT_PX_PER_LEVEL}px` }}
      >
        <div className="lists-view__row">
          <button
            type="button"
            className={`lists-view__chevron${hasChildren ? '' : ' lists-view__chevron--hidden'}`}
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
            onClick={(e) => { e.stopPropagation(); toggleExpanded(list.id) }}
          >
            {hasChildren ? (isExpanded ? '▾' : '▸') : ''}
          </button>

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

          <div className="lists-view__item-body">
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
              <span className="lists-view__item-name">
                {renderNameWithHighlight(list.name, searchQuery)}
              </span>
            )}
            <span className="lists-view__item-count">
              {count} {count === 1 ? 'item' : 'items'}
            </span>
          </div>

          <div className="lists-view__item-actions" onClick={(e) => e.stopPropagation()}>
            {canAddSubList && (
              <button
                type="button"
                className="lists-view__add-sub-btn"
                onClick={() => onCreateList(list.id)}
                title="Add sub-list"
                aria-label="Add sub-list"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z"/>
                </svg>
              </button>
            )}
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
        </div>

        {hasChildren && isExpanded && (
          <ul className="lists-view__children">
            {children.map(renderNode)}
          </ul>
        )}
      </li>
    )
  }

  return (
    <div className="lists-view">
      <div className="lists-view__header">
        <h2 className="lists-view__title">My Lists</h2>
        <button className="btn btn--secondary lists-view__new-btn" onClick={() => onCreateList(null)}>
          + New List
        </button>
      </div>

      <div className="lists-view__search">
        <input
          type="text"
          className="lists-view__search-input"
          placeholder="Search lists…"
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

      {tree.length === 0 ? (
        <div className="lists-view__empty">
          <p>No lists yet. Create one to organize your reading.</p>
        </div>
      ) : isSearchActive && search.visibleIds.size === 0 ? (
        <div className="lists-view__empty">
          <p>No lists matching "{searchQuery}".</p>
        </div>
      ) : (
        <ul className="lists-view__list">
          {tree.map(renderNode)}
        </ul>
      )}
    </div>
  )
}

export default ListsView
