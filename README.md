<p align="center">
  <img src="screenshots/checkpoint-logo.png" width="140" alt="Checkpoint logo" />
</p>

<h1 align="center">Checkpoint</h1>

<p align="center">
  Track your manga, manhwa, and manhua reading progress across any website.
  <br />
  A Chrome Side Panel extension powered by ComicK, AniList, and MangaDex.
</p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/checkpoint/bomngiemgfgjnlpanapgbeimmihnjaka"><img src="https://img.shields.io/chrome-web-store/v/bomngiemgfgjnlpanapgbeimmihnjaka?style=flat&logo=googlechrome&logoColor=white&label=Chrome%20Web%20Store" alt="Chrome Web Store" /></a>
  <a href="https://github.com/elghaied/checkpoint/actions/workflows/ci.yml"><img src="https://github.com/elghaied/checkpoint/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/elghaied/checkpoint" alt="License" /></a>
</p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/checkpoint/bomngiemgfgjnlpanapgbeimmihnjaka"><strong>Install from Chrome Web Store &rarr;</strong></a>
</p>

<br />

<p align="center">
  <img src="screenshots/general-view.png" width="180" alt="Tracking list" />&nbsp;&nbsp;
  <img src="screenshots/edit.png" width="180" alt="Edit modal" />&nbsp;&nbsp;
  <img src="screenshots/filters.png" width="180" alt="Filters" />&nbsp;&nbsp;
  <img src="screenshots/list-view.png" width="180" alt="Lists" />&nbsp;&nbsp;
  <img src="screenshots/settings-view.png" width="180" alt="Settings" />
</p>

<br />

## What is Checkpoint?

Checkpoint lives in Chrome's side panel — it stays open next to your reading page so you never have to switch tabs. When you're on a manga site, hit the **+** button and Checkpoint auto-detects what you're reading and which chapter you're on. It searches ComicK first (with AniList and MangaDex as fallbacks), grabs the cover art and metadata, and saves it to your local library. Next time you read a new chapter of the same title, add it again and your progress updates automatically (it never goes backwards).

Everything is stored locally on your device. No accounts, no tracking, no analytics.

## Getting Started

1. Install from the [Chrome Web Store](https://chromewebstore.google.com/detail/checkpoint/bomngiemgfgjnlpanapgbeimmihnjaka)
2. Open the side panel (click the Checkpoint icon or use `Ctrl+Shift+Y`)
3. Navigate to any manga reading site
4. Click the **+** button to start tracking

## Features

### Tracking & Progress

- **One-click tracking** — Navigate to any chapter on any manga site and click **+**. Checkpoint detects the title and chapter number automatically.
- **Smart progress** — If you re-add a title at a higher chapter, your progress updates. It never goes backwards, so you can't accidentally lose your place.
- **Continue reading** — Each title remembers where you were last reading. Click **Open** to jump right back.
- **Pin to top** — Pin your favorite titles so they always appear at the top of your library, regardless of sort order.
- **Sort controls** — Sort your library by Last Updated, Alphabetical (A-Z), Chapters Ahead, or Recently Added. Your preference persists across sessions.

### Discover

Find new manga to read without leaving the extension.

- **Trending** — Browse what's popular right now on ComicK, filterable by type (Manga, Manhwa, Manhua). One-click **Track** button to add to your library.
- **For You** — Personalized recommendations based on the genres you read most. Checkpoint analyzes your tracked items and finds popular titles in your favorite genres.

### Bulk Actions

Select multiple items at once for batch operations:

- Click **Select** in the header to enter selection mode
- Check items individually or use **Select All**
- Available actions: **Delete**, **Tag** (with color picker), **Add to List**, **Notify On/Off**
- Tags added via bulk action are registered in the tag system with full color support

### Organizing Your Library

#### Tags

Create your own tags (like "Favorites", "On Hold", "Must Read") to organize titles your way. Tags get a color dot automatically, and you can change the color anytime.

To add a tag: open a title's **Edit** modal, type in the **Tags** field, and press Enter. Manage all your tags from the **Tags** view in the side navigation.

<p align="center">
  <img src="screenshots/create-new-tag.png" width="220" alt="Creating a new tag" />&nbsp;&nbsp;
  <img src="screenshots/tag-view.png" width="220" alt="Tags view" />
</p>

#### Lists

Organize titles into lists like "Reading", "Completed", or "Plan to Read" (these three are created by default). You can add as many custom lists as you want. Click a list to see its contents, and use **+ Add Items** to pick titles from your library.

<p align="center">
  <img src="screenshots/list-view.png" width="220" alt="Lists view" />&nbsp;&nbsp;
  <img src="screenshots/list-view-adding-titles.png" width="220" alt="Adding items to a list" />
</p>

#### Filtering

Use the filter panel to narrow down your library. Checkpoint uses a **tri-state filter** system for genres and tags — click a genre or tag once, twice, or three times to cycle through:

| State | Color | Meaning | Example |
|-------|-------|---------|---------|
| **AND** | Green | Title **must** have this | Green "Action" = only show titles tagged Action |
| **OR** | Blue | Title can have **any** of these | Blue "Action" + Blue "Comedy" = show titles that have Action OR Comedy |
| **Exclude** | Red | Title must **not** have this | Red "Romance" = hide all Romance titles |

You can combine these freely. For example: AND "Action" + OR "Fantasy" + OR "Adventure" + Exclude "Romance" shows Action titles that also have Fantasy or Adventure, but nothing with Romance.

The filter panel also works together with the **format tabs** (All, Manga, Manhwa, Manhua) at the top.

<p align="center">
  <img src="screenshots/filters.png" width="300" alt="Filter panel with genres and tags" />
</p>

### Notifications

Checkpoint checks for new chapter releases in the background and sends browser notifications when titles you're tracking get updated.

- **Enable notifications** — Master toggle in Settings, plus per-title control via the bell icon on each card
- **Smart notifications** — Only notify for chapters released *after* you started tracking (so you don't get flooded with old releases)
- **Check interval** — How often to check (default: 60 minutes)
- **Badge count** — The extension icon shows a red badge with the number of titles that have new chapters available (only titles with notifications enabled)
- **Bulk control** — Use selection mode to enable/disable notifications for multiple titles at once

> **Note:** Chapter data comes from ComicK as the primary source, with AniList and MangaDex as fallbacks. ComicK provides reliable chapter counts for the vast majority of titles.

### CSV Bulk Import

If you have a reading list in a spreadsheet (Excel, Google Sheets, etc.), you can import it all at once instead of adding titles one by one.

#### Preparing Your CSV

**From Excel:** File > Save As > choose "CSV (Comma delimited) (*.csv)"

**From Google Sheets:** File > Download > Comma Separated Values (.csv)

Your CSV needs a **title** column (required). These other columns are optional:

| Column | What it does | Example |
|--------|-------------|---------|
| `title` | The manga/manhwa name | One Piece |
| `ch` or `chapter` | Your current chapter | 1120 |
| `url` or `link` | Where you read it | https://mangadex.org/chapter/abc123 |
| `tags` or `tag` | Comma-separated tags | action, shounen |

Column names are case-insensitive (`Title`, `TITLE`, `title` all work). Any extra columns are ignored, so you don't need to clean up your spreadsheet first.

**Example CSV:**
```
title,ch,url,tags
One Piece,1120,https://mangadex.org/chapter/abc123,shounen
Jujutsu Kaisen,268,,action
Solo Leveling,200,https://manganato.com/manga-dr980474/chapter-200,action
```

#### How Import Works

1. **Upload** — Go to Settings > **Import from CSV** (or open the import tab directly). Pick your CSV file. Checkpoint shows a preview so you can verify it parsed correctly.

<p align="center">
  <img src="screenshots/import-csv-step-1-preview.png" width="600" alt="CSV upload preview" />
</p>

2. **Matching** — Checkpoint searches ComicK, AniList, and MangaDex for each title. A progress bar shows how far along it is. You can pause and resume at any time — your progress is saved even if you close the tab.

3. **Review** — See all results in a table with color-coded confidence levels:
   - **Green** = high confidence match
   - **Yellow** = possible match, worth checking
   - **Red** = couldn't find a match automatically

   Click any title's action button to see alternatives, search by a different name, or skip it.

<p align="center">
  <img src="screenshots/import-csv-step-2-matching.png" width="400" alt="Review matches table" />&nbsp;&nbsp;
  <img src="screenshots/import-csv-step-3-review-title.png" width="400" alt="Finding the right match" />
</p>

4. **Confirm** — Choose which tiers to import. Matched titles are selected by default. Click **Import Selected** to add them to your library. Titles you didn't import can be exported as a CSV for another try later.

<p align="center">
  <img src="screenshots/import-csv-step-4-confirm-import.png" width="600" alt="Confirm import" />
</p>

### Backup & Restore

In Settings, you can:

- **Export backup** — Download your full library (titles, tags, lists, settings) as a JSON file
- **Import backup** — Restore from a previous backup
- **Report an issue** — Opens GitHub Issues if you run into problems

<p align="center">
  <img src="screenshots/settings-view.png" width="250" alt="Settings page" />
</p>

## Supported Sites

Checkpoint works on most manga reading sites including MangaDex, Webtoon, Tapas, MangaPlus, and generic reader sites. It uses page metadata (title, URL patterns, heading text) to detect what you're reading. When auto-detection doesn't work on a particular site, search for the title manually — Checkpoint remembers the association for next time via the **Alternative Names** feature in the Edit modal.

---

## For Developers

### Tech Stack

| Layer | Technology |
|---|---|
| **Extension** | Chrome Manifest V3, Side Panel API |
| **UI** | React 19, BEM CSS |
| **Language** | TypeScript (strict mode) |
| **Build** | Vite + custom esbuild plugin for content script IIFE bundling |
| **APIs** | ComicK REST (primary), AniList GraphQL, MangaDex REST |
| **Testing** | Vitest |
| **CI/CD** | GitHub Actions (typecheck, lint, test on push/PR; auto-release on tags) |

### Architecture

Four execution contexts communicating via `chrome.runtime.sendMessage`:

```
Side Panel (React UI)     Import Tab (React UI)
       ↕                         ↕
Background Service Worker ← Alarms (hourly chapter checks)
       ↕                  ← ComicK REST API (primary)
Content Script            ← AniList GraphQL API (fallback)
(DOM metadata extraction) ← MangaDex REST API (fallback)
                          ← Chrome Storage (local)
```

| Context | Entry Point | Role |
|---|---|---|
| **Side Panel** | `src/sidepanel/main.tsx` | React UI - item list, search, edit, lists, tags, settings |
| **Import Tab** | `src/import/main.tsx` | CSV bulk import - parse, batch match, review, confirm (dedicated browser tab) |
| **Service Worker** | `src/background/index.ts` | Central hub - API calls, storage, message routing, chapter checking, rate limiting |
| **Content Script** | `src/content/index.ts` | DOM parsing - extracts title and chapter via heuristics (IIFE-bundled) |

### Key Design Decisions

- **Serialization queue** in storage layer prevents race conditions on concurrent mutations
- **TTL cache** (5-min expiry, 100-entry limit) avoids redundant API calls
- **Confidence scoring** uses Levenshtein distance with Jaccard token-overlap; ComicK and AniList results get a position-based confidence boost (trusting their search ranking for typo tolerance); results below 0.7 threshold prompt user selection
- **ComicK enrichment** fetches detail data (alt titles, genres, AniList cross-reference) at save time for richer metadata
- **Silent migration** cross-references existing AniList/MangaDex items with ComicK on startup, adding `comickSlug` for better chapter checking
- **Sliding window rate limiter** enforces 75 requests/minute during CSV import to stay within API rate limits
- **Content script** is injected on-demand (not on every page) and bundled as IIFE to avoid ES module restrictions
- **Tri-state filter engine** evaluates AND/OR/Exclude logic per filter entry, composable across genres, tags, and format

### Project Structure

```
src/
├── sidepanel/           # Side Panel React UI
│   ├── components/      # NavRail, ItemCard, FilterPanel, EditModal, DiscoverView, BulkActionBar, etc.
│   ├── hooks/           # useTrackedItems, useAddItem, useFilterPanel, useCustomTags, etc.
│   ├── services/        # Typed chrome.runtime.sendMessage wrapper
│   └── styles/          # Global CSS with BEM design tokens
├── import/              # CSV Import Tab (dedicated browser tab)
│   ├── components/      # FileUpload, MatchProgress, ReviewTable, SimilarModal, ConfirmPanel
│   ├── hooks/           # useImportSession, useBatchMatcher
│   ├── services/        # Import-specific messaging wrapper
│   ├── csvParser.ts     # PapaParse-based CSV parser with column detection
│   └── confirmLogic.ts  # Tier classification, duplicate detection, diagnostic CSV export
├── background/          # Service Worker
│   ├── index.ts         # Message router
│   ├── searchService.ts # Multi-provider search (ComicK → AniList → MangaDex)
│   ├── chapterChecker.ts# Alarm-based batch chapter checking + badge updates
│   ├── comick.ts        # ComicK REST client (primary provider)
│   ├── anilist.ts       # AniList GraphQL client (fallback)
│   ├── mangadex.ts      # MangaDex REST client (fallback)
│   ├── discover.ts      # Trending + For You recommendation engine
│   ├── migration.ts     # Silent ComicK cross-reference migration
│   ├── rateLimiter.ts   # Sliding window rate limiter for import API calls
│   ├── cache.ts         # TTLCache with LRU eviction
│   └── retry.ts         # Exponential backoff for fetch
├── content/             # Content Script (IIFE)
│   ├── index.ts         # Message listener
│   └── metadata.ts      # DOM parsing (og:title, h1, chapter regex)
├── shared/              # Shared types, utils, constants, logger, filter engine
└── storage/             # Storage abstraction with serialization queue
```

### Development Setup

**Prerequisites:** Node.js 18+, npm 9+

```bash
git clone https://github.com/elghaied/checkpoint.git
cd checkpoint
npm install
```

**Commands:**

```bash
npm run dev          # Dev build with watch
npm run build        # Production build with type checking
npm run typecheck    # TypeScript validation
npm run lint         # ESLint
npm run test         # Vitest
npm run test:watch   # Vitest in watch mode
```

Load the `dist/` folder as an unpacked extension at `chrome://extensions` (Developer mode).

### Releasing

1. Update version in `package.json` and `public/manifest.json`
2. Commit, tag (`git tag vX.Y.Z`), and push with tags
3. GitHub Actions builds, zips, and creates a GitHub Release automatically

### Contributing

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes
4. Push and open a Pull Request

CI runs typecheck, lint, and tests on all PRs.

## License

MIT - see [LICENSE](LICENSE) for details.

## Acknowledgments

[ComicK](https://comick.io), [AniList](https://anilist.co), and [MangaDex](https://mangadex.org) for their free APIs.

---

<p align="center"><em>Optimize for reading flow, not data perfection.</em></p>
