# Checkpoint

A Chrome Side Panel extension that tracks your manga, manhwa, and manhua reading progress using AniList as the metadata source.

## Features

- **One-click tracking** - Add your current reading page with a single click
- **Auto-detection** - Automatically extracts title and chapter from the page
- **AniList integration** - Fetches cover images, titles, and metadata from AniList
- **Format tabs** - View All items or filter by Manga (JP), Manhwa (KR), or Manhua (CN)
- **Smart duplicate handling** - Re-adding a manga automatically updates progress if you're on a higher chapter
- **Local title matching** - Recognizes manga by alternative names without API calls
- **Manual search** - Search AniList directly when auto-detection fails
- **Google fallback** - Find alternative names via Google when titles aren't recognized
- **Alternative names** - View and manage stored alternative names for better matching
- **Edit & delete** - Manually adjust titles, progress, format, or remove entries
- **Persistent storage** - Data saved locally via Chrome storage
- **Dark theme** - Easy on the eyes during late-night reading sessions

## Installation

### From Source

1. Clone the repository:
   ```bash
   git clone https://github.com/elghaied/checkpoint.git
   cd checkpoint
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the extension:
   ```bash
   npm run build
   ```

4. Load in Chrome:
   - Open `chrome://extensions`
   - Enable "Developer mode" (top right)
   - Click "Load unpacked"
   - Select the `dist` folder

5. Pin the extension to your toolbar for easy access

## Usage

1. Navigate to any manga/manhwa/manhua reading page
2. Click the Checkpoint icon in your toolbar to open the side panel
3. Click the **+** button to add the current page
4. Checkpoint checks if you're already tracking this title (by main or alternative names)
   - If found: automatically updates progress if you're on a higher chapter
   - If not found: searches AniList for matches
5. If multiple matches are found, select the correct title
6. Your progress is now tracked!

### Managing Entries

- **Switch tabs** - View All or filter by Manga, Manhwa, or Manhua
- **Edit** - Click "Edit" on any card to change title, progress, format, or alternative names
- **Alternative names** - Add/remove alternative names to help Checkpoint recognize the manga on different sites
- **Delete** - Click "Delete" in the edit modal (requires confirmation)
- **Open** - Click "Open" to navigate back to your last reading position

### When Auto-Detection Fails

If Checkpoint doesn't recognize a title:

1. A search modal appears with a search box
2. Type the correct title and click "Search"
3. If you don't know the title, click "Find Alternative Names" to search Google
4. Select the correct result from AniList
5. The original page title is automatically saved as an alternative name for future visits

## Development

### Prerequisites

- Node.js 18+
- npm 9+

### Scripts

```bash
# Development build with watch mode
npm run dev

# Production build
npm run build

# Type checking
npm run typecheck
```

### Project Structure

```
checkpoint/
├── src/
│   ├── sidepanel/          # React UI (Side Panel)
│   │   ├── components/     # React components
│   │   ├── hooks/          # Custom React hooks
│   │   ├── services/       # Chrome messaging service
│   │   └── styles/         # CSS styles
│   ├── background/         # Service Worker
│   │   ├── index.ts        # Message routing
│   │   └── anilist.ts      # AniList API client
│   ├── content/            # Content Script
│   │   └── index.ts        # Page metadata extraction
│   ├── shared/             # Shared code
│   │   ├── types.ts        # TypeScript types
│   │   └── utils.ts        # Utility functions
│   └── storage/            # Storage abstraction
│       ├── index.ts        # Singleton export
│       └── storageService.ts
├── public/
│   ├── manifest.json       # Chrome extension manifest
│   └── icons/              # Extension icons
├── dist/                   # Built extension (load this in Chrome)
├── vite.config.ts          # Vite build configuration
├── tsconfig.json           # TypeScript configuration
└── package.json
```

### Architecture

The extension has three execution contexts:

1. **Side Panel** - React app for the UI
2. **Background Service Worker** - Central hub for API calls and storage
3. **Content Script** - Extracts metadata from reading pages

```
User clicks "Add"
       ↓
Side Panel UI
       ↓
Background Service Worker
       ↓
Content Script (extracts title/chapter)
       ↓
Local Storage (check for existing match by title/alt names)
       ↓
[If found] → Update progress → Done
[If not found] ↓
AniList API (metadata lookup)
       ↓
Chrome Storage (persist)
       ↓
Side Panel UI (refresh)
```

### Data Model

```typescript
interface TrackedItem {
  provider: 'anilist'
  providerId: string           // AniList ID (primary key)
  mediaType: 'manga'
  format: 'MANGA' | 'MANHWA' | 'MANHUA'
  titles: {
    main: string               // Display title
    alt: string[]              // Alternative names for matching
  }
  coverImage: string
  progress: {
    unit: 'chapter'
    value: string
  }
  lastUrl: string
  updatedAt: number
  createdAt: number
}
```

## Supported Sites

Checkpoint uses heuristics to extract metadata and should work on most manga reading sites. Tested on:

- MangaDex
- Webtoon
- Tapas
- MangaPlus
- Most generic manga reader sites

If a site doesn't work well, you can manually search and select the correct title. Once you do, Checkpoint saves the site's title as an alternative name so it will be recognized automatically next time.

## Tech Stack

- **Chrome Extensions** - Manifest V3, Side Panel API
- **TypeScript** - Type-safe code
- **React 19** - UI framework
- **Vite** - Build tool
- **AniList GraphQL API** - Metadata source

## Privacy

- All data is stored locally in your browser
- No accounts required
- Only makes requests to AniList API for metadata lookups
- No tracking or analytics

## Roadmap

- [x] Manual search fallback
- [x] Alternative names management
- [x] Smart progress updates
- [ ] Cloud sync (optional)
- [ ] Anime tracking support
- [ ] Release notifications

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) for details

## Acknowledgments

- [AniList](https://anilist.co) for providing the free API
- Inspired by the need to track reading across multiple sites

---

**Guiding Principle:** Optimize for reading flow, not data perfection. If adding or updating progress isn't effortless, the tool has failed.
