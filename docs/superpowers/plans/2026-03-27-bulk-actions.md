# Bulk Actions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add selection mode with bulk delete, tag, add-to-list, and toggle-notifications operations.

**Architecture:** Ephemeral React state in App.tsx for selection mode. A "Select" button in the header activates it, showing checkboxes on cards and a floating action bar at the bottom. No data model changes — uses existing CRUD in loops.

**Tech Stack:** TypeScript, React 19, CSS Modules

---

## File Map

| File | Responsibility |
|------|----------------|
| `src/sidepanel/components/BulkActionBar.tsx` | New — floating bar with actions and counter |
| `src/sidepanel/components/BulkActionBar.css` | New — styles |
| `src/sidepanel/components/ItemCard.tsx` | Checkbox overlay in selection mode |
| `src/sidepanel/components/ItemCard.css` | Checkbox styles |
| `src/sidepanel/App.tsx` | Selection state, "Select" button, pass selection props to cards |

---

## Task 1: BulkActionBar Component

**Files:**
- Create: `src/sidepanel/components/BulkActionBar.tsx`
- Create: `src/sidepanel/components/BulkActionBar.css`

- [ ] **Step 1: Create BulkActionBar component**

Create `src/sidepanel/components/BulkActionBar.tsx`:

```typescript
import './BulkActionBar.css'

interface BulkActionBarProps {
  selectedCount: number
  totalCount: number
  onSelectAll: () => void
  onDeselectAll: () => void
  onDelete: () => void
  onTag: () => void
  onAddToList: () => void
  onToggleNotifications: () => void
  onCancel: () => void
}

const BulkActionBar: React.FC<BulkActionBarProps> = ({
  selectedCount,
  totalCount,
  onSelectAll,
  onDeselectAll,
  onDelete,
  onTag,
  onAddToList,
  onToggleNotifications,
  onCancel,
}) => {
  const allSelected = selectedCount === totalCount && totalCount > 0

  return (
    <div className="bulk-bar">
      <div className="bulk-bar__top">
        <span className="bulk-bar__count">{selectedCount} selected</span>
        <button
          className="bulk-bar__select-toggle"
          onClick={allSelected ? onDeselectAll : onSelectAll}
        >
          {allSelected ? 'Deselect All' : 'Select All'}
        </button>
      </div>
      <div className="bulk-bar__actions">
        <button
          className="bulk-bar__btn bulk-bar__btn--delete"
          onClick={onDelete}
          disabled={selectedCount === 0}
          title="Delete selected"
        >
          Delete
        </button>
        <button
          className="bulk-bar__btn"
          onClick={onTag}
          disabled={selectedCount === 0}
          title="Tag selected"
        >
          Tag
        </button>
        <button
          className="bulk-bar__btn"
          onClick={onAddToList}
          disabled={selectedCount === 0}
          title="Add to list"
        >
          Add to List
        </button>
        <button
          className="bulk-bar__btn"
          onClick={onToggleNotifications}
          disabled={selectedCount === 0}
          title="Toggle notifications"
        >
          Notifications
        </button>
        <button className="bulk-bar__btn bulk-bar__btn--cancel" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}

export default BulkActionBar
```

- [ ] **Step 2: Create BulkActionBar styles**

Create `src/sidepanel/components/BulkActionBar.css`:

```css
.bulk-bar {
  position: fixed;
  bottom: 0;
  left: 40px;
  right: 0;
  background: var(--surface, #1a1a2e);
  border-top: 1px solid var(--border, #2a2a4a);
  padding: 8px 12px;
  z-index: 100;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.bulk-bar__top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.bulk-bar__count {
  font-size: 12px;
  font-weight: 600;
  color: var(--primary, #e94560);
}

.bulk-bar__select-toggle {
  background: none;
  border: none;
  color: var(--text-muted, #a0a0a0);
  font-size: 11px;
  cursor: pointer;
  text-decoration: underline;
}

.bulk-bar__actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.bulk-bar__btn {
  padding: 6px 10px;
  border: 1px solid var(--border, #2a2a4a);
  border-radius: 6px;
  background: var(--bg, #0f0f1a);
  color: var(--text, #e0e0e0);
  font-size: 11px;
  cursor: pointer;
  transition: background 0.15s;
}

.bulk-bar__btn:hover:not(:disabled) {
  background: var(--border, #2a2a4a);
}

.bulk-bar__btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.bulk-bar__btn--delete {
  color: #ff4444;
  border-color: #ff4444;
}

.bulk-bar__btn--cancel {
  margin-left: auto;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/sidepanel/components/BulkActionBar.tsx src/sidepanel/components/BulkActionBar.css
git commit -m "feat: add BulkActionBar component"
```

---

## Task 2: Selection Mode in ItemCard

**Files:**
- Modify: `src/sidepanel/components/ItemCard.tsx`
- Modify: `src/sidepanel/components/ItemCard.css`

- [ ] **Step 1: Add selection props to ItemCard**

Add to ItemCardProps:
```typescript
  selectionMode?: boolean
  selected?: boolean
  onSelect?: () => void
```

Add checkbox overlay at the top of the card div (inside `item-card__cover-wrap`):
```tsx
        {selectionMode && (
          <div className="item-card__checkbox" onClick={(e) => { e.stopPropagation(); onSelect?.() }}>
            <input type="checkbox" checked={selected} readOnly />
          </div>
        )}
```

- [ ] **Step 2: Add checkbox styles**

Add to `ItemCard.css`:
```css
.item-card__checkbox {
  position: absolute;
  top: 4px;
  left: 4px;
  z-index: 10;
  background: rgba(0, 0, 0, 0.6);
  border-radius: 4px;
  padding: 2px;
  cursor: pointer;
}

.item-card__checkbox input {
  cursor: pointer;
  width: 16px;
  height: 16px;
  accent-color: var(--primary, #e94560);
}
```

Also make `item-card__cover-wrap` position relative if not already:
```css
.item-card__cover-wrap {
  position: relative;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/sidepanel/components/ItemCard.tsx src/sidepanel/components/ItemCard.css
git commit -m "feat: add selection checkbox to ItemCard"
```

---

## Task 3: Wire Selection Mode in App.tsx

**Files:**
- Modify: `src/sidepanel/App.tsx`

- [ ] **Step 1: Add selection state and handlers**

Add state:
```typescript
const [selectionMode, setSelectionMode] = useState(false)
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
```

Add handlers:
```typescript
const toggleSelection = (providerId: string) => {
  setSelectedIds((prev) => {
    const next = new Set(prev)
    if (next.has(providerId)) next.delete(providerId)
    else next.add(providerId)
    return next
  })
}

const selectAll = () => {
  setSelectedIds(new Set(displayedItems.map((item) => item.providerId)))
}

const deselectAll = () => setSelectedIds(new Set())

const exitSelectionMode = () => {
  setSelectionMode(false)
  setSelectedIds(new Set())
}

const handleBulkDelete = async () => {
  if (!confirm(`Delete ${selectedIds.size} items?`)) return
  for (const id of selectedIds) {
    await deleteItem(id)
  }
  exitSelectionMode()
  refresh()
}

const handleBulkToggleNotifications = async () => {
  for (const id of selectedIds) {
    const item = items.find((i) => i.providerId === id)
    if (item) {
      await updateItem(id, { notificationsEnabled: !item.notificationsEnabled })
    }
  }
  exitSelectionMode()
  refresh()
}
```

Add "Select" button next to the sort dropdown in the header area.

Pass selection props to ItemCard:
```tsx
selectionMode={selectionMode}
selected={selectedIds.has(item.providerId)}
onSelect={() => toggleSelection(item.providerId)}
```

Render BulkActionBar when in selection mode:
```tsx
{selectionMode && (
  <BulkActionBar
    selectedCount={selectedIds.size}
    totalCount={displayedItems.length}
    onSelectAll={selectAll}
    onDeselectAll={deselectAll}
    onDelete={handleBulkDelete}
    onTag={() => { /* TODO: implement tag picker modal */ }}
    onAddToList={() => { /* TODO: implement list picker modal */ }}
    onToggleNotifications={handleBulkToggleNotifications}
    onCancel={exitSelectionMode}
  />
)}
```

Note: Tag and Add-to-List bulk operations require picker modals. For the initial implementation, implement Delete and Toggle Notifications (no modal needed). Tag and Add-to-List can show existing modals adapted for bulk use, or be added in a follow-up.

- [ ] **Step 2: Run typecheck, lint, tests, build**

Run: `npm run typecheck && npm run lint && npm run test && npm run build`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add src/sidepanel/App.tsx
git commit -m "feat: wire selection mode with bulk delete and toggle notifications"
```

---

## Task 4: Bulk Tag and Add-to-List (Follow-up)

**Files:**
- Modify: `src/sidepanel/App.tsx`

- [ ] **Step 1: Implement bulk tag**

Add a simple prompt-based tag input for now (or reuse existing tag picker):
```typescript
const handleBulkTag = async () => {
  const tagName = prompt('Enter tag name to add:')
  if (!tagName?.trim()) return
  for (const id of selectedIds) {
    const item = items.find((i) => i.providerId === id)
    if (item && !item.tags.includes(tagName.trim())) {
      await updateItem(id, { tags: [...item.tags, tagName.trim()] })
    }
  }
  exitSelectionMode()
  refresh()
}
```

- [ ] **Step 2: Implement bulk add-to-list**

Show a simple list picker (reuse existing list data):
```typescript
const handleBulkAddToList = async () => {
  if (lists.length === 0) {
    alert('No lists available. Create a list first.')
    return
  }
  const listNames = lists.filter((l) => l.type === 'manual').map((l) => l.name)
  const listName = prompt(`Add to list:\n${listNames.map((n, i) => `${i + 1}. ${n}`).join('\n')}\n\nEnter list number:`)
  if (!listName) return
  const listIndex = parseInt(listName, 10) - 1
  const manualLists = lists.filter((l) => l.type === 'manual')
  const targetList = manualLists[listIndex]
  if (!targetList) return
  const newIds = [...new Set([...targetList.itemIds, ...selectedIds])]
  await updateList(targetList.id, { itemIds: newIds })
  exitSelectionMode()
  refreshLists()
}
```

- [ ] **Step 3: Wire handlers to BulkActionBar**

Replace the placeholder handlers:
```tsx
onTag={handleBulkTag}
onAddToList={handleBulkAddToList}
```

- [ ] **Step 4: Run all checks and commit**

Run: `npm run typecheck && npm run lint && npm run test && npm run build`

```bash
git add src/sidepanel/App.tsx
git commit -m "feat: add bulk tag and add-to-list operations"
```
