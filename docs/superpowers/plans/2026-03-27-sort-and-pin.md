# Sort Controls + Pin to Top — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add sort controls (last updated, alphabetical, chapters ahead, recently added) and pin-to-top functionality for tracked items.

**Architecture:** New `sortOrder` field in ExtensionSettings persisted via chrome.storage. New `pinned` field on TrackedItem. Sort logic applied in `useTrackedItems` hook. UI: sort dropdown next to search bar, pin toggle on item cards.

**Tech Stack:** TypeScript, React 19, CSS Modules, Vitest

---

## File Map

| File | Responsibility |
|------|----------------|
| `src/shared/types.ts` | Add `pinned` to TrackedItem/ExportedItem, `sortOrder` to ExtensionSettings |
| `src/sidepanel/hooks/useTrackedItems.ts` | Apply sort + pin logic based on settings |
| `src/sidepanel/components/SortDropdown.tsx` | New — sort selector dropdown |
| `src/sidepanel/components/SortDropdown.css` | New — styles |
| `src/sidepanel/components/ItemCard.tsx` | Add pin toggle button |
| `src/sidepanel/components/ItemCard.css` | Pin icon styles |
| `src/sidepanel/App.tsx` | Wire sort dropdown, pass settings |
| `src/storage/storageService.ts` | Handle `pinned` in export/import |

---

## Task 1: Data Model — Types & Storage

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/storage/storageService.ts`

- [ ] **Step 1: Add `pinned` to TrackedItem and ExportedItem**

In `src/shared/types.ts`, add after `anilistId: string | null` in TrackedItem:
```typescript
  pinned: boolean                    // Pin to top of list
```

Add same field to ExportedItem after `anilistId`:
```typescript
  pinned: boolean
```

- [ ] **Step 2: Add `sortOrder` to ExtensionSettings and DEFAULT_SETTINGS**

In `src/shared/types.ts`, add to `ExtensionSettings`:
```typescript
  sortOrder: 'updatedAt' | 'alphabetical' | 'chaptersAhead' | 'createdAt'
```

Update `DEFAULT_SETTINGS`:
```typescript
export const DEFAULT_SETTINGS: ExtensionSettings = {
  globalNotificationsEnabled: true,
  notifyOnlyNewReleases: true,
  checkIntervalMinutes: 60,
  exportVersion: 1,
  sortOrder: 'updatedAt',
}
```

- [ ] **Step 3: Update storageService export/import**

In `storageService.ts` `exportData()`, add to the exportedItems mapping:
```typescript
pinned: item.pinned ?? false,
```

In `importData()`, add to normalizedItem:
```typescript
pinned: (importItem as TrackedItem).pinned ?? false,
```

- [ ] **Step 4: Fix all places that construct TrackedItem literals**

Add `pinned: false` to TrackedItem construction in:
- `src/sidepanel/hooks/useAddItem.ts`
- `src/import/components/ConfirmPanel.tsx`
- Any test fixtures that build TrackedItem objects

- [ ] **Step 5: Run typecheck and tests**

Run: `npm run typecheck && npm run test`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/storage/storageService.ts src/sidepanel/hooks/useAddItem.ts src/import/components/ConfirmPanel.tsx
git commit -m "feat: add pinned and sortOrder fields to data model"
```

---

## Task 2: Sort Logic in useTrackedItems

**Files:**
- Modify: `src/sidepanel/hooks/useTrackedItems.ts`

- [ ] **Step 1: Update hook to accept sortOrder and apply sort + pin**

Replace the full content of `src/sidepanel/hooks/useTrackedItems.ts`:

```typescript
import { useState, useEffect, useCallback } from 'react'
import type { TrackedItem, ExtensionSettings } from '@/shared/types'
import { getAllItems } from '../services/messaging'

type Format = TrackedItem['format']
type SortOrder = ExtensionSettings['sortOrder']

function sortItems(items: TrackedItem[], sortOrder: SortOrder): TrackedItem[] {
  // Separate pinned and unpinned
  const pinned = items.filter((item) => item.pinned)
  const unpinned = items.filter((item) => !item.pinned)

  const compareFn = (a: TrackedItem, b: TrackedItem): number => {
    switch (sortOrder) {
      case 'alphabetical':
        return a.titles.main.localeCompare(b.titles.main)
      case 'chaptersAhead': {
        const aAhead = (a.latestKnownChapters ?? 0) - (parseFloat(a.progress.value) || 0)
        const bAhead = (b.latestKnownChapters ?? 0) - (parseFloat(b.progress.value) || 0)
        return bAhead - aAhead
      }
      case 'createdAt':
        return b.createdAt - a.createdAt
      case 'updatedAt':
      default:
        return b.updatedAt - a.updatedAt
    }
  }

  pinned.sort(compareFn)
  unpinned.sort(compareFn)

  return [...pinned, ...unpinned]
}

export function useTrackedItems(format?: Format, sortOrder: SortOrder = 'updatedAt') {
  const [items, setItems] = useState<TrackedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const result = await getAllItems(format)
      setItems(sortItems(result, sortOrder))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load items')
    } finally {
      setLoading(false)
    }
  }, [format, sortOrder])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Patch state in-place from storage change events instead of re-fetching
  useEffect(() => {
    const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if ('trackedItems' in changes && changes.trackedItems.newValue) {
        const newItems = changes.trackedItems.newValue as TrackedItem[]

        const filtered = format
          ? newItems.filter((item) => item.format === format)
          : newItems

        setItems(sortItems(filtered, sortOrder))
        setError(null)
        setLoading(false)
      }
    }
    chrome.storage.onChanged.addListener(listener)
    return () => chrome.storage.onChanged.removeListener(listener)
  }, [format, sortOrder])

  return { items, loading, error, refresh }
}
```

- [ ] **Step 2: Run tests**

Run: `npm run typecheck && npm run test`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add src/sidepanel/hooks/useTrackedItems.ts
git commit -m "feat: add sort + pin logic to useTrackedItems hook"
```

---

## Task 3: Sort Dropdown Component

**Files:**
- Create: `src/sidepanel/components/SortDropdown.tsx`
- Create: `src/sidepanel/components/SortDropdown.css`

- [ ] **Step 1: Create SortDropdown component**

Create `src/sidepanel/components/SortDropdown.tsx`:

```typescript
import type { ExtensionSettings } from '@/shared/types'
import './SortDropdown.css'

type SortOrder = ExtensionSettings['sortOrder']

interface SortDropdownProps {
  value: SortOrder
  onChange: (value: SortOrder) => void
}

const SORT_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: 'updatedAt', label: 'Last Updated' },
  { value: 'alphabetical', label: 'A-Z' },
  { value: 'chaptersAhead', label: 'Chapters Ahead' },
  { value: 'createdAt', label: 'Recently Added' },
]

const SortDropdown: React.FC<SortDropdownProps> = ({ value, onChange }) => {
  return (
    <div className="sort-dropdown">
      <select
        className="sort-dropdown__select"
        value={value}
        onChange={(e) => onChange(e.target.value as SortOrder)}
        aria-label="Sort order"
      >
        {SORT_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  )
}

export default SortDropdown
```

- [ ] **Step 2: Create SortDropdown styles**

Create `src/sidepanel/components/SortDropdown.css`:

```css
.sort-dropdown {
  position: relative;
}

.sort-dropdown__select {
  appearance: none;
  background: var(--surface, #1a1a2e);
  color: var(--text, #e0e0e0);
  border: 1px solid var(--border, #2a2a4a);
  border-radius: 6px;
  padding: 4px 24px 4px 8px;
  font-size: 12px;
  cursor: pointer;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M2.5 4.5L6 8L9.5 4.5' stroke='%23a0a0a0' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round' fill='none'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 6px center;
}

.sort-dropdown__select:focus {
  outline: none;
  border-color: var(--primary, #e94560);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/sidepanel/components/SortDropdown.tsx src/sidepanel/components/SortDropdown.css
git commit -m "feat: add SortDropdown component"
```

---

## Task 4: Pin Toggle on ItemCard

**Files:**
- Modify: `src/sidepanel/components/ItemCard.tsx`
- Modify: `src/sidepanel/components/ItemCard.css`

- [ ] **Step 1: Add pin button to ItemCard**

In `ItemCard.tsx`, add `onTogglePin` to the props interface:
```typescript
interface ItemCardProps {
  item: TrackedItem
  index: number
  onEdit: () => void
  onOpen: () => void
  onToggleNotifications?: (enabled: boolean) => void
  onTogglePin?: () => void
}
```

Update the component signature to destructure `onTogglePin`:
```typescript
const ItemCard: React.FC<ItemCardProps> = ({ item, index, onEdit, onOpen, onToggleNotifications, onTogglePin }) => {
```

Add pin button in the `item-card__header` div, before the bell button:
```tsx
          <button
            className={`item-card__pin ${item.pinned ? 'item-card__pin--active' : ''}`}
            onClick={(e) => { e.stopPropagation(); onTogglePin?.() }}
            title={item.pinned ? 'Unpin' : 'Pin to top'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
            </svg>
          </button>
```

- [ ] **Step 2: Add pin styles to ItemCard.css**

Add to `src/sidepanel/components/ItemCard.css`:

```css
.item-card__pin {
  background: none;
  border: none;
  color: var(--text-muted, #808080);
  cursor: pointer;
  padding: 2px;
  border-radius: 4px;
  opacity: 0.4;
  transition: opacity 0.15s, color 0.15s;
}

.item-card__pin:hover {
  opacity: 0.8;
}

.item-card__pin--active {
  color: var(--primary, #e94560);
  opacity: 1;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/sidepanel/components/ItemCard.tsx src/sidepanel/components/ItemCard.css
git commit -m "feat: add pin toggle button to ItemCard"
```

---

## Task 5: Wire Everything in App.tsx

**Files:**
- Modify: `src/sidepanel/App.tsx`

- [ ] **Step 1: Import SortDropdown and useSettings, wire sort and pin**

Add imports:
```typescript
import SortDropdown from './components/SortDropdown'
import { useSettings } from './hooks/useSettings'
```

In the App component body, add settings hook:
```typescript
const { settings, updateSettings } = useSettings()
```

Update the useTrackedItems call to pass sortOrder:
```typescript
const { items, loading, error, refresh } = useTrackedItems(undefined, settings.sortOrder)
```

Note: the `format` filter is handled differently — check how `activeTab` filtering works in the current App. The useTrackedItems hook may need the format from activeTab. Read the current code carefully and pass both `format` and `sortOrder`.

Add SortDropdown to the header area (next to SearchBar):
```tsx
<SortDropdown
  value={settings.sortOrder}
  onChange={(sortOrder) => updateSettings({ sortOrder })}
/>
```

Add pin toggle handler and pass to ItemCard:
```typescript
const handleTogglePin = async (providerId: string, currentPinned: boolean) => {
  await updateItem(providerId, { pinned: !currentPinned })
}
```

Pass `onTogglePin` to ItemCard in the render:
```tsx
onTogglePin={() => handleTogglePin(item.providerId, item.pinned)}
```

- [ ] **Step 2: Run typecheck, lint, tests, build**

Run: `npm run typecheck && npm run lint && npm run test && npm run build`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add src/sidepanel/App.tsx
git commit -m "feat: wire sort dropdown and pin toggle in App"
```

---

## Task 6: Full Integration Verification

- [ ] **Step 1: Run all checks**

Run: `npm run typecheck && npm run lint && npm run test && npm run build`
Expected: ALL PASS

- [ ] **Step 2: Fix any issues**

Common: missing `pinned: false` in test fixtures, import path issues.

- [ ] **Step 3: Commit and verify**

```bash
git add -A
git commit -m "fix: resolve remaining issues from sort and pin feature"
```
