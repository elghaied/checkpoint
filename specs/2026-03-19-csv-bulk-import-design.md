# CSV Bulk Import — Design Spec

## Overview

A CSV bulk import feature for Checkpoint that lets users import hundreds of manga/manhwa/manhua titles from spreadsheets. The workflow opens in a dedicated browser tab and follows four phases: Parse → Match → Review → Confirm.

## Architecture

**Approach:** Import tab drives the batch loop, background service worker executes searches.

The import tab is a fourth Vite entry point (`src/import/`) — a standalone React app that shares types, utilities, and design tokens with the side panel but has its own components. It communicates with the SW via `chrome.runtime.sendMessage` using two new message types. Session state is persisted in `chrome.storage.local` under dedicated keys.

### Why the import tab drives (not the SW)

Chrome aggressively terminates idle service workers after ~5 minutes. Keeping one alive for a 30-minute import session requires fragile keepalive hacks. The import tab driving the loop means:

- Tab closure = natural pause (session persisted, resume later)
- No orphaned background work burning API quota
- SW stays thin — executes individual searches on demand

### Communication

Import tab → SW → AniList/MangaDex APIs. Both the import tab and side panel read/write `chrome.storage.local` independently — no key overlap during import. At confirm time, items are saved through the existing `SAVE_ITEM` message path and serialization queue.

The side panel detects import state via `chrome.storage.onChanged` (same pattern as existing hooks).

---

## Data Model

### Import Session (heavy, temporary)

Stored at key `importSession` in `chrome.storage.local`. Deleted after confirm.

```typescript
type ImportPhase = 'parsed' | 'matching' | 'review' | 'confirmed';
type MatchStatus = 'pending' | 'matched' | 'failed';
type MatchTier = 'green' | 'yellow' | 'red';

interface ImportSession {
  id: string;                        // UUID
  phase: ImportPhase;
  createdAt: number;
  lastActivityAt: number;            // For 30-day auto-discard
  csvSummary: {
    totalRows: number;
    withChapters: number;
    withUrls: number;
    withTags: number;
  };
  rows: ImportRow[];
}

interface ImportRow {
  index: number;                     // Original CSV row number
  csvTitle: string;
  csvChapter: string | null;
  csvUrl: string | null;
  csvTags: string[];

  // Populated during matching
  matchStatus: MatchStatus;
  matchTier: MatchTier | null;
  bestMatch: UnifiedSearchResult | null;
  alternatives: UnifiedSearchResult[];  // Up to 5
  confidenceScore: number | null;

  // Populated after matching (duplicate check against library by providerId)
  duplicateOf: string | null;
  duplicateConflict: DuplicateConflict | null;

  // User overrides during review
  userSelection: UnifiedSearchResult | null;
  userSkipped: boolean;
}

type DuplicateConflict =
  | { type: 'higher_chapter_no_url' }
  | { type: 'different_site'; existingUrl: string; importUrl: string };
```

### Pending Review List (lightweight, persistent)

Stored at key `pendingReview`. Survives session cleanup. Created from unimported/unresolved rows after confirm. Auto-discarded after 30 days of inactivity.

A new import that generates a pending review list **replaces** any existing one — the new import supersedes the old.

```typescript
interface PendingReviewList {
  createdAt: number;
  lastActivityAt: number;
  items: PendingReviewItem[];
}

interface PendingReviewItem {
  csvTitle: string;
  csvChapter: string | null;
  csvUrl: string | null;
  csvTags: string[];
  tier: 'yellow' | 'red';
  bestMatch: UnifiedSearchResult | null;
  alternatives: UnifiedSearchResult[];  // Kept for resolution without re-searching
  confidenceScore: number | null;
}
```

### Storage Keys

| Key | Type | Lifecycle |
|-----|------|-----------|
| `importSession` | `ImportSession` | Created at parse, deleted after confirm |
| `pendingReview` | `PendingReviewList` | Created at confirm (if remainders exist), auto-discarded after 30 days |

---

## Message Types

Two new messages added to the discriminated union in `types.ts`:

```typescript
// Search with built-in rate limiting
{ type: 'IMPORT_SEARCH'; query: string; extractedTitle: string }
// Response: MessageResponse<UnifiedSearchResult[]>
//        | MessageResponse<{ rateLimited: true; waitMs: number }>

// Coordinate with chapter checker
{ type: 'IMPORT_STATUS'; active: boolean }
// Response: MessageResponse<void>
```

`IMPORT_SEARCH` combines rate checking and search execution in a single round trip. If the rate budget is available, the SW executes the search and returns results. If not, it returns `{ rateLimited: true, waitMs: N }` and the import tab waits before retrying.

`IMPORT_STATUS` tells the SW whether an import is active. When active, the hourly chapter checker skips its cycle to avoid API contention.

---

## Rate Limiting

The SW maintains a sliding window counter for API calls:

```typescript
interface RateLimiter {
  timestamps: number[];          // Rolling window of request timestamps
  maxPerMinute: number;          // 90 (AniList ceiling)
  importBudget: number;          // 75 (import allocation)
  reservedForBackground: number; // 15 (chapter checker, manual adds)
}
```

- Import gets 75 requests/minute (AniList ceiling is 90, leaving buffer)
- When import is active, chapter checker defers its next alarm cycle entirely
- Sliding window is self-correcting — no state to clean up if import tab crashes
- No semaphore or token system — just count recent timestamps

---

## Confidence Thresholds

Bulk import uses stricter thresholds than single-title add to minimize silent mismatches:

| Tier | Score Range | Behavior |
|------|-------------|----------|
| Green (matched) | ≥ 0.85 | Auto-matched, high confidence |
| Yellow (possible) | 0.50 – 0.84 | Best guess shown, needs user confirmation |
| Red (no match) | < 0.50 | No reliable match, user must search manually |

Compare: single-title add uses `CONFIDENCE_THRESHOLD = 0.7` as the single cutoff.

---

## Phase 1: Parse

### CSV Format

| Column | Required | Notes |
|--------|----------|-------|
| `title` | Yes | Manga/manhwa/manhua name |
| `ch` / `chapter` | No | Current chapter number |
| `url` / `link` | No | Reading URL |
| `tags` / `tag` | No | Comma-separated tags |

Column detection is case-insensitive and whitespace-tolerant. Unrecognized columns are silently ignored (makes exported diagnostic CSVs re-importable).

### Parsing

- Use PapaParse (~13KB) for CSV parsing. Handles quoted fields, UTF-8 BOM, encoding.
- `header: true`, `skipEmptyLines: true`, `transformHeader` for column normalization.
- If `title` column is missing, show a column remapping dropdown: "No 'title' column found. Found: name, chapter, link. Use 'name' as title?"
- Strip rows with empty/whitespace-only titles
- Chapter parsing: extract numeric portion ("ch 45" → 45, "latest" → null)
- Tag parsing: split on comma, trim, deduplicate per row
- Tag case normalization: if registry has "Romance", CSV tag "romance" maps to existing "Romance"

### Summary Screen

After parsing, show:
- Row counts: total titles, how many have chapters/URLs/tags, unique tag count
- Preview table of first 3–5 parsed rows (sanity check for encoding/delimiter issues)
- "Start Matching" button

No duplicate detection at this phase (requires providerId, which comes from matching).

---

## Phase 2: Match

### Batch Orchestration

The `useBatchMatcher` hook in the import tab drives the loop:

1. Iterate rows where `matchStatus === 'pending'`
2. Send `IMPORT_SEARCH` to SW with cleaned title
3. If `rateLimited` response → wait `waitMs`, resend
4. Classify result by confidence score → set `matchTier`
5. Store `bestMatch`, `alternatives` (up to 5), `confidenceScore`
6. Every 10 rows → save session to `chrome.storage.local` (crash safety checkpoint)
7. Update progress UI

### Post-Matching Duplicate Detection

After all rows are matched:
1. Load existing library via `GET_ALL_ITEMS`
2. For each row with a `bestMatch.providerId`, check against existing library items
3. Apply conflict rules:
   - Higher chapter + has URL → mark for auto-update (no conflict)
   - Higher chapter + no URL → `duplicateConflict: { type: 'higher_chapter_no_url' }`
   - Different site URL → `duplicateConflict: { type: 'different_site', ... }`
   - Same or lower chapter → skip silently

### Pause / Resume

- Pause flag checked between iterations; session saved immediately on pause
- Resume picks up from first `pending` row
- UI shows: "Import paused — 160/500 searched. [Resume] [Cancel]"

### Failure Handling

- Network/API errors → `matchStatus: 'failed'`, continue to next row
- After loop completes, if failures exist: "X titles failed. [Retry Failed]"
- Retry only re-processes `failed` rows

### Progress UI

- Progress bar with count, percentage, estimated time remaining
- "Now searching: [title]" card (accepts sub-second flicker at 75 req/min — communicates activity)
- Running tally of green/yellow/red/failed counts — real-time match quality feedback
- Collapsible batch details for power users
- Pause / Cancel buttons always visible

---

## Phase 3: Review

### Results Table

Full data table with every imported title:

| Column | Content |
|--------|---------|
| Status dot | Green / yellow / red / blue (duplicate) |
| CSV Title | Original title from CSV |
| Matched To | Best match title + cover thumbnail (or "No match found") |
| Score | Confidence score |
| Ch | Chapter from CSV |
| Format | MANGA / MANHWA / MANHUA |
| Action | Context-aware button |

### Action Buttons Per Tier

| Tier | Button | Behavior |
|------|--------|----------|
| Green | "Similar" | Open modal to override auto-match (just in case) |
| Yellow | "Review" | Open modal to confirm or change best guess |
| Red | "Search" | Open modal with search bar focused for manual title entry |
| Duplicate | "Resolve" | Open modal showing conflict details and resolution options |

All four buttons open the same `SimilarModal` component with different initial states.

### Table Features

- Summary banner: green / yellow / red / duplicate counts (duplicates are a filter view, orthogonal to tiers)
- Filter pills: toggle tier visibility, multiple can be active simultaneously
- Text search bar for title filtering
- Sortable columns
- "Retry Failed (X)" button — only shown when failed rows exist (replaces generic "Back to Matching")
- "Continue to Import →" advances to confirm phase

### SimilarModal

Reuses the same search-result presentation pattern as the side panel's `SearchModal`:
- Cover image, title, format badge, chapter count for each alternative
- Search bar within the modal for running new searches (primary resolution path for red titles)
- "Skip" option to defer resolution

---

## Phase 4: Confirm

### Confirm Panel

```
Ready to Import

☑ Matched titles (267)
☐ Possible matches (48)
☐ No match / unresolved (30)

──────────────────────────
12 duplicates will be handled:
  • 5 updates (higher ch + URL)
  • 4 skipped (same or lower ch)
  • 3 conflicts → staged for review

23 new tags will be created
──────────────────────────

[Import Selected]
[Stage remaining for review]
[Export remaining as CSV]
```

Tier checkboxes group by confidence tier (green/yellow/red), not by duplicate status. Unresolved conflicts are automatically staged for review — no blocking.

### Import Execution

1. Collect rows from checked tiers with resolved matches
2. Auto-create new tags in `CustomTagRegistry` with auto-assigned colors (palette cycling via existing `getNextColor()`)
3. Build `TrackedItem` from each match:
   - `provider`, `providerId`, `titles`, `coverImage`, `format` → from search result
   - `progress.value` → CSV chapter (or "0")
   - `lastUrl` → CSV URL (or empty)
   - `tags` → CSV tags
   - `notificationsEnabled` → true
4. Send individual `SAVE_ITEM` messages through existing SW path and serialization queue
5. For duplicate updates: `UPDATE_ITEM` with new chapter + URL
6. Progress indicator: "Importing... 45/267"
7. Result summary: "234 added, 5 updated, 28 skipped"

Individual `SAVE_ITEM` messages (not bulk) to reuse existing progress-only-goes-up logic and deduplication. Sequential saves through the serialization queue take a few seconds for ~267 items — acceptable after a multi-minute matching phase.

### Post-Import

1. Unimported rows + unresolved conflicts → `PendingReviewList` (replaces any existing one)
2. Delete `ImportSession` from storage
3. Completion screen with: count summary, "View in Side Panel", "Export as CSV", "Done"
4. "Done" returns to file picker for another import

---

## CSV Export (Diagnostic)

"Export remaining as CSV" generates a re-importable CSV:

| Column | Content |
|--------|---------|
| `title` | Original CSV title |
| `ch` | Original CSV chapter |
| `url` | Original CSV URL |
| `tags` | Original CSV tags |
| `status` | `possible_match` / `no_match` / `conflict` |
| `best_match` | Best match title (informational) |
| `confidence` | Score (informational) |

The `status`, `best_match`, and `confidence` columns are diagnostic — the import parser ignores unrecognized columns, so the file works as both a report and a re-import source.

Generated client-side with string concatenation + proper CSV escaping. Blob download, same pattern as existing JSON export.

---

## Side Panel Integration

### Changes

1. **`usePendingReview` hook** — checks `pendingReview` and `importSession` keys in storage, listens to `chrome.storage.onChanged`
2. **Banner in App.tsx** — below SearchBar/FilterPanel, above ItemList:
   - Active import: "Import in progress (160/345) — [Resume]"
   - Pending review: "78 titles pending review — [Resume] [×]"
   - Dismiss (×) shows `confirm()` dialog: "Discard 78 unreviewed titles? This can't be undone."
   - Priority: active session banner > pending review banner (mutually exclusive)
3. **Settings page button** — "Import from CSV" → `chrome.tabs.create({ url: chrome.runtime.getURL('import/index.html') })`

No other side panel changes. Newly imported items appear automatically via existing `chrome.storage.onChanged` listener in `useTrackedItems`.

---

## Import Tab Architecture

### File Structure

```
src/import/
├── index.html            # Entry point HTML
├── main.tsx              # React entry point
├── App.tsx               # Phase router (parse → match → review → confirm)
├── csvParser.ts          # CSV parsing, column detection, validation
├── components/
│   ├── FileUpload.tsx    # File picker + validation summary + row preview
│   ├── MatchProgress.tsx # Progress bar, current title, ETA, pause/resume
│   ├── ReviewTable.tsx   # Sortable/filterable results table
│   ├── ConfirmPanel.tsx  # Tier checkboxes + import/stage/export actions
│   └── SimilarModal.tsx  # Match selection modal (reuses search result pattern)
├── hooks/
│   ├── useImportSession.ts   # Load/save session from chrome.storage.local
│   └── useBatchMatcher.ts    # Batch loop orchestrator
└── styles/
    └── import.module.css
```

### Build Configuration

Add import page as fourth Vite entry:

```typescript
// vite.config.ts
input: {
  sidepanel: 'src/sidepanel/index.html',
  import: 'src/import/index.html',
  background: 'src/background/index.ts',
}
```

### Manifest Changes

```json
{
  "permissions": ["unlimitedStorage"],
  "web_accessible_resources": [{
    "resources": ["import/index.html"],
    "matches": ["<all_urls>"]
  }]
}
```

`unlimitedStorage` is a no-prompt permission. Necessary because a 500-row import with 5 alternatives each could reach ~5MB against the default 10MB `chrome.storage.local` limit.

### Shared Code

- **Shared:** Types, utilities, constants from `src/shared/`. CSS design tokens (colors, typography, spacing) via shared CSS variables. Messaging wrapper pattern.
- **Not shared:** React components. The import tab and side panel have different UIs (data table vs. card list) — sharing components would force abstractions that serve neither well.
- **Implementation note:** The existing `copySidepanelHtml` Vite plugin deletes `dist/src/` after moving the sidepanel HTML. When the import entry is added, this cleanup will also remove `import/index.html`. The plugin must be updated to handle both HTML files before cleanup.

### Session Resume

On mount, `useImportSession` checks `chrome.storage.local`:
- `importSession` exists → route to appropriate phase
- `pendingReview` exists, no session → show simplified review table for pending items
- Neither → show `FileUpload`

### Concurrent Import Guard

Only one `ImportSession` at a time. If a session exists when the user tries to upload a new CSV: "You have an active import session. [Resume it] or [Discard and start new]."

---

## Tags

- CSV tags auto-create in `CustomTagRegistry` with auto-assigned colors (palette cycling)
- Case normalization: if registry has "Romance", CSV tag "romance" maps to existing entry
- Trim whitespace during parse
- No tag mapping step — frictionless, users adjust colors later in TagsView
- **Implementation note:** `getNextColor()` currently lives inside the `useCustomTags` React hook. Extract the color-cycling logic to a shared utility so the import tab can use it without duplicating the hook.

---

## Error Handling

### CSV Parsing
- Empty file → error message
- Missing `title` column → column remapping dropdown
- Non-CSV file → garbled preview catches it before matching starts

### Matching
- Network offline / API errors → row marked `failed`, continue to next
- AniList 429 → existing `fetchWithRetry` with exponential backoff
- AniList down → all rows fail, "Retry Failed" when ready
- Tab closed mid-matching → session persisted at last 10-row checkpoint, resume on reopen

### Storage
- `unlimitedStorage` permission prevents hitting 10MB limit

### Concurrency
- Only one import session at a time
- Import tab writes `importSession`/`pendingReview`, side panel writes `trackedItems`/`settings`/`customTags`/`customLists` — no key overlap during import
- Confirm-time saves go through existing `SAVE_ITEM` path and serialization queue
- Manual adds from side panel during import are caught by post-matching duplicate detection

### 30-Day Auto-Discard
- `PendingReviewList.lastActivityAt` checked on side panel load
- If stale (> 30 days), silently deleted

---

## Testing

| File | Coverage |
|------|----------|
| `src/import/csvParser.test.ts` | Column detection, remapping, chapter extraction, tag splitting, BOM, quoted fields, empty rows, case normalization |
| `src/import/batchMatcher.test.ts` | Progress tracking, pause/resume, failure handling, session persistence at checkpoints, duplicate detection post-matching |
| `src/import/confirmLogic.test.ts` | Tier grouping, duplicate conflict resolution, tag auto-creation, PendingReviewList generation, CSV export format |
| `src/background/rateLimiter.test.ts` | Sliding window enforcement, chapter checker deferral, window expiry |

React components are not unit tested — logic lives in hooks and utilities. Manual testing catches rendering issues; targeted tests added if bugs found.

---

## What This Spec Does NOT Cover

- XLSX support (CSV only — users export CSV from any spreadsheet tool)
- "Add as unlinked/custom entry" (every title must match AniList or MangaDex)
- Automatic chapter updates without a corresponding URL
- AniList OAuth integration for importing user lists (separate feature)
