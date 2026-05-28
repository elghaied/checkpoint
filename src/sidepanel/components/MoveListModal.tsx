import { useMemo, useState } from 'react'
import type { CustomList } from '@/shared/types'
import { buildListTree, descendantIds, subtreeMaxDepthBelow, type ListNode } from '@/shared/listTree'
import { MAX_LIST_NESTING_DEPTH } from '@/shared/constants'
import './MoveListModal.css'

interface MoveListModalProps {
  lists: CustomList[]
  movingList: CustomList
  onConfirm: (newParentId: string | null) => void
  onClose: () => void
}

const INDENT_PX_PER_LEVEL = 16

const MoveListModal: React.FC<MoveListModalProps> = ({ lists, movingList, onConfirm, onClose }) => {
  const tree = useMemo(() => buildListTree(lists), [lists])
  const ownSubtreeDepth = useMemo(() => subtreeMaxDepthBelow(movingList.id, lists), [lists, movingList.id])
  const forbiddenIds = useMemo(
    () => new Set<string>([movingList.id, ...descendantIds(movingList.id, lists)]),
    [lists, movingList.id],
  )

  const [selectedParentId, setSelectedParentId] = useState<string | null | undefined>(undefined)

  function isDisabled(node: ListNode): { disabled: boolean; reason: string | null } {
    const { list, depth } = node
    if (forbiddenIds.has(list.id)) return { disabled: true, reason: 'self or descendant' }
    if (list.type !== 'manual') return { disabled: true, reason: 'smart list' }
    // After move, movingList sits at (depth + 1) and its deepest descendant sits at
    // (depth + 1) + ownSubtreeDepth. Reject if that exceeds MAX-1 (0-indexed).
    const newDeepest = depth + 1 + ownSubtreeDepth
    if (newDeepest > MAX_LIST_NESTING_DEPTH - 1) return { disabled: true, reason: 'depth' }
    return { disabled: false, reason: null }
  }

  function renderNode(node: ListNode): React.ReactNode {
    const { list, children, depth } = node
    const { disabled, reason } = isDisabled(node)
    const isSelected = selectedParentId === list.id
    return (
      <li key={list.id}>
        <button
          type="button"
          className={`move-list-modal__row${isSelected ? ' move-list-modal__row--selected' : ''}${disabled ? ' move-list-modal__row--disabled' : ''}`}
          style={{ paddingLeft: `${8 + depth * INDENT_PX_PER_LEVEL}px` }}
          disabled={disabled}
          onClick={() => setSelectedParentId(list.id)}
          title={disabled ? `Cannot move here (${reason})` : ''}
        >
          {list.name}
        </button>
        {children.length > 0 && (
          <ul className="move-list-modal__children">{children.map(renderNode)}</ul>
        )}
      </li>
    )
  }

  return (
    <div className="move-list-modal__backdrop" onClick={onClose}>
      <div className="move-list-modal" onClick={(e) => e.stopPropagation()}>
        <header className="move-list-modal__header">
          <h3>Move "{movingList.name}" to…</h3>
          <button className="move-list-modal__close" onClick={onClose} aria-label="Close">×</button>
        </header>

        <ul className="move-list-modal__tree">
          <li>
            <button
              type="button"
              className={`move-list-modal__row${selectedParentId === null ? ' move-list-modal__row--selected' : ''}`}
              onClick={() => setSelectedParentId(null)}
            >
              (root)
            </button>
          </li>
          {tree.map(renderNode)}
        </ul>

        <footer className="move-list-modal__footer">
          <button className="btn btn--secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn btn--primary"
            disabled={selectedParentId === undefined}
            onClick={() => {
              if (selectedParentId !== undefined) onConfirm(selectedParentId)
            }}
          >
            Move
          </button>
        </footer>
      </div>
    </div>
  )
}

export default MoveListModal
