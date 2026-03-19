# Navigation Rail + UX Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Header icon buttons with a vertical NavRail, fix ListsView click targets, extract tag management into its own view.

**Architecture:** NavRail is a new standalone component. TagsView is extracted from SettingsPage. App.tsx layout changes to flex row. ListsView click targets are rewired.

**Tech Stack:** TypeScript, React 19, CSS (BEM), Chrome Extension

**Spec:** `docs/superpowers/specs/2026-03-19-nav-rail-ux-fixes-design.md`

---

## Task 1: Create NavRail Component

**Files:**
- Create: `src/sidepanel/components/NavRail.tsx` + `NavRail.css`

- [ ] Create `NavRail.tsx` with props `activeView` and `onViewChange`. Render 4 icon buttons (General, Lists, Tags, Settings) in a 34px vertical strip. Active tab uses content bg color with `border-radius: 0 6px 6px 0` for connected effect. Each tab has a hover tooltip label positioned to the left. Settings separated by gap at bottom. Use CSS for hover/active states and tooltip animation.

- [ ] Create `NavRail.css` with BEM classes. Strip bg `#0a0a18`, active tab bg `var(--bg-primary)`, inactive icons `var(--text-secondary)`, hover brightening, tooltip flyout styling.

- [ ] Commit: `feat: add NavRail component with connected tab design`

---

## Task 2: Create TagsView Component

**Files:**
- Create: `src/sidepanel/components/TagsView.tsx` + `TagsView.css`
- Modify: `src/sidepanel/components/SettingsPage.tsx` + `SettingsPage.css`

- [ ] Extract the Tags management section from SettingsPage into a new `TagsView` component. Add a header with "Tags" title and count badge. Keep same functionality: colored dots, inline rename, color picker, delete with confirmation. Add empty state message.

- [ ] Remove the Tags section from SettingsPage. SettingsPage keeps Notifications, Data, About only.

- [ ] Commit: `feat: extract tag management into dedicated TagsView`

---

## Task 3: Integrate NavRail + Rewire App.tsx

**Files:**
- Modify: `src/sidepanel/App.tsx`
- Modify: `src/sidepanel/components/Header.tsx` + `Header.css`

- [ ] Simplify Header: remove `onListsClick` and `onSettingsClick` props and their icon buttons. Header is now logo + title + count only.

- [ ] Update App.tsx view type to `'general' | 'lists' | 'tags' | 'settings'`. Rename all `'list'` references to `'general'`.

- [ ] Change App.tsx root layout to flex row: `<div className="app"><div className="app__content">...content...</div><NavRail activeView={view} onViewChange={setView} /></div>`. Content area gets `flex: 1; overflow: auto`.

- [ ] Add TagsView rendering when `view === 'tags'`. Remove `onBack` from SettingsPage (NavRail handles navigation now).

- [ ] Verify typecheck passes, run build.

- [ ] Commit: `feat: integrate NavRail, simplify Header, add tags view routing`

---

## Task 4: Fix ListsView Click Targets

**Files:**
- Modify: `src/sidepanel/components/ListsView.tsx` + `ListsView.css`

- [ ] Make clicking the list row body (name, count area) open the list instead of triggering rename.

- [ ] Add a pencil icon button in the actions area (next to delete) that enters rename mode. Remove the old click-on-name-to-rename behavior.

- [ ] Commit: `fix: improve ListsView click targets — row opens, pencil renames`

---

## Task 5: Final Verification

- [ ] Run `npm run typecheck` — zero errors
- [ ] Run `npm run test -- --run` — all tests pass
- [ ] Run `npm run lint` — clean
- [ ] Run `npm run build` — successful
- [ ] Commit any fixes if needed
