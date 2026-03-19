# Navigation Rail + UX Fixes

## Overview

Three changes: replace the Header icon buttons with a vertical navigation rail, fix ListsView click targets, and extract tag management into its own view.

## 1. Navigation Rail

### Layout

App layout changes from a single column to a flex row:

```
┌─────────────────────────┬────┐
│                         │ ■  │  General (active, connected bg)
│    Content Area         │ ■  │  Lists
│    (current view)       │ ■  │  Tags
│                         │    │
│                         │ ■  │  Settings (separated by gap)
└─────────────────────────┴────┘
```

### View Types

Expand from `'list' | 'settings' | 'lists'` to `'general' | 'lists' | 'tags' | 'settings'`.

### NavRail Component

New component: `src/sidepanel/components/NavRail.tsx` + `.css`

**Props:**
- `activeView: View` — currently active view
- `onViewChange: (view: View) => void` — callback when a tab is clicked

**Visual design:**
- 34px-wide vertical strip on the right edge of the app
- 4 icon buttons (30x30px squares) with 6px gap
- Top 3: General (grid icon), Lists (list icon), Tags (tag icon)
- Bottom: Settings (gear icon), separated from top 3 by a gap (`margin-top: auto` or explicit spacing)
- Strip background: darker than content (e.g. `#0a0a18`) so inactive tabs recede

**Active tab (connected effect):**
- Background matches content area (`--bg-primary` / `#1a1a2e`)
- Left border removed — tab visually merges into the page
- Border-radius: `0 6px 6px 0` (rounded on right side only)
- Icon color: accent (`--accent` / `#e94560`)

**Inactive tabs:**
- Background: transparent (sit in the darker strip)
- Icon color: `--text-secondary` (`#a0a0a0`)
- On hover: background lightens slightly (`rgba(255,255,255,0.06)`), icon brightens to `--text-primary`

**Hover label:**
- Only the hovered tab shows a label — tooltip-style flyout to the left
- Positioned absolutely: `right: 36px`, vertically centered to the tab
- Background: `--bg-secondary`, border: `--border`, rounded, shadow
- Contains the view name (e.g. "General", "Lists", "Tags", "Settings")
- Appears on hover, disappears on mouse leave. CSS transition for smooth appearance.

### Header Simplification

Remove the lists and settings icon buttons from Header. Header becomes: logo + "Checkpoint" title + tracked count badge only. The `onListsClick` and `onSettingsClick` props are removed.

### App.tsx Changes

- Rename view type from `'list'` to `'general'`
- Add `'tags'` to the view type
- Wrap the content area and NavRail in a flex row container
- NavRail receives `activeView` and `onViewChange`
- When `activeView === 'tags'`, render the new TagsView component

## 2. ListsView UX Fix

### Problem

Clicking a list name triggers rename. Opening requires clicking the narrow arrow icon — poor click target.

### Fix

- **Click list row** (title, count, anywhere on the row body) → opens the list
- **Pencil icon button** in the actions area → enters rename mode
- Remove click-on-name-to-rename behavior
- Rename input still uses blur/Enter to submit, Escape to cancel
- Pencil icon sits next to the delete button in the actions column

## 3. Tags View

### New Component

`src/sidepanel/components/TagsView.tsx` + `.css`

Extracted from the current tag management section in SettingsPage. Rendered when `activeView === 'tags'`.

**Contains:**
- Header: "Tags" title + count badge (e.g. "12 tags")
- Tag list: each tag shows colored dot (click for color picker), name (click to rename inline), delete button with confirmation
- Empty state: "No tags created yet. Add tags from any item's edit screen."
- Uses `useCustomTags` hook (same as the current SettingsPage implementation)

### SettingsPage Cleanup

Remove the "Tags" section from SettingsPage. SettingsPage keeps only: Notifications, Data (export/import), and About.

## 4. Files Summary

### New Files
- `src/sidepanel/components/NavRail.tsx` + `NavRail.css`
- `src/sidepanel/components/TagsView.tsx` + `TagsView.css`

### Modified Files
- `src/sidepanel/App.tsx` — flex layout, new view type, NavRail integration, TagsView rendering
- `src/sidepanel/components/Header.tsx` + `Header.css` — remove nav buttons, simplify
- `src/sidepanel/components/ListsView.tsx` + `ListsView.css` — fix click targets, add pencil icon
- `src/sidepanel/components/SettingsPage.tsx` + `SettingsPage.css` — remove Tags section
