# Discover Tab (Trending + For You) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Discover tab with Trending (from ComicK) and For You (genre-based + recommendations) sub-tabs, with one-click tracking.

**Architecture:** New `discover.ts` background service fetches ComicK trending and computes personalized recommendations. New `DiscoverView` component with sub-tabs. DiscoverCard component with "Track" button that enriches and saves. NavRail gets a new "Discover" entry.

**Tech Stack:** TypeScript, React 19, CSS Modules, ComicK API

---

## File Map

### New Files
| File | Responsibility |
|------|----------------|
| `src/background/discover.ts` | Trending fetch, "For You" computation |
| `src/background/discover.test.ts` | Tests |
| `src/sidepanel/components/DiscoverView.tsx` | Discover tab with Trending/ForYou sub-tabs |
| `src/sidepanel/components/DiscoverView.css` | Styles |
| `src/sidepanel/components/DiscoverCard.tsx` | Card for discover results with Track button |
| `src/sidepanel/components/DiscoverCard.css` | Styles |

### Modified Files
| File | Changes |
|------|---------|
| `src/shared/types.ts` | Add `DiscoverItem` interface, `GET_TRENDING`/`GET_FOR_YOU` messages |
| `src/background/index.ts` | Add message handlers |
| `src/sidepanel/services/messaging.ts` | Add `getTrending()`, `getForYou()` wrappers |
| `src/sidepanel/components/NavRail.tsx` | Add "Discover" nav entry |
| `src/sidepanel/App.tsx` | Add Discover view routing |

---

## Task 1: Types & Message Infrastructure

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/sidepanel/services/messaging.ts`

- [ ] **Step 1: Add DiscoverItem interface**

In `src/shared/types.ts`, add after ComicKMedia interface:

```typescript
// Item from ComicK discover/trending endpoints
export interface DiscoverItem {
  hid: string
  slug: string
  title: string
  coverUrl: string
  country: string           // 'jp', 'kr', 'cn'
  status: number
  lastChapter: number | null
  rating: string | null
  followCount: number
  altTitles: string[]
  genres: number[]           // genre IDs from trending (resolved in UI)
}
```

- [ ] **Step 2: Add message types**

Add to `MessageRequest` union:
```typescript
| { type: 'GET_TRENDING'; comicTypes?: string[] }
| { type: 'GET_FOR_YOU' }
```

- [ ] **Step 3: Add messaging wrappers**

In `src/sidepanel/services/messaging.ts`:
```typescript
import type { ..., DiscoverItem } from '@/shared/types'

export async function getTrending(comicTypes?: string[]): Promise<DiscoverItem[]> {
  return sendMessage<DiscoverItem[]>({ type: 'GET_TRENDING', comicTypes })
}

export async function getForYou(): Promise<DiscoverItem[]> {
  return sendMessage<DiscoverItem[]>({ type: 'GET_FOR_YOU' })
}
```

- [ ] **Step 4: Commit**

```bash
git add src/shared/types.ts src/sidepanel/services/messaging.ts
git commit -m "feat: add DiscoverItem type and message infrastructure"
```

---

## Task 2: Discover Background Service

**Files:**
- Create: `src/background/discover.ts`
- Create: `src/background/discover.test.ts`
- Modify: `src/background/index.ts`

- [ ] **Step 1: Write tests for discover service**

Create `src/background/discover.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchTrending, computeForYou } from './discover'

vi.mock('./retry', () => ({
  fetchWithRetry: vi.fn(),
}))

vi.mock('./comick', () => ({
  fetchComicDetail: vi.fn(),
}))

import { fetchWithRetry } from './retry'
const mockFetch = vi.mocked(fetchWithRetry)

function mockOkResponse(body: unknown): Response {
  return { ok: true, status: 200, json: () => Promise.resolve(body), text: () => Promise.resolve('') } as Response
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('fetchTrending', () => {
  it('returns normalized discover items from /top endpoint', async () => {
    mockFetch.mockResolvedValue(mockOkResponse([
      { hid: 'h1', slug: 'test', title: 'Test', cover_url: 'https://img.jpg', country: 'kr', status: 1, last_chapter: 50, rating: '8.5', user_follow_count: 1000, md_titles: [{ title: 'Alt' }], genres: [1, 2] },
    ]))

    const results = await fetchTrending()

    expect(results).toHaveLength(1)
    expect(results[0].hid).toBe('h1')
    expect(results[0].title).toBe('Test')
    expect(results[0].followCount).toBe(1000)
  })

  it('returns empty array on error', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))

    const results = await fetchTrending()

    expect(results).toEqual([])
  })
})

describe('computeForYou', () => {
  it('returns empty array when no tracked items', async () => {
    const results = await computeForYou([], new Set())

    expect(results).toEqual([])
  })
})
```

- [ ] **Step 2: Implement discover service**

Create `src/background/discover.ts`:

```typescript
import type { DiscoverItem, TrackedItem } from '@/shared/types'
import { COMICK_API_BASE } from '@/shared/constants'
import { fetchWithRetry } from './retry'
import { createLogger } from '@/shared/logger'
import { TTLCache } from './cache'

const log = createLogger('discover')
const trendingCache = new TTLCache<DiscoverItem[]>(15 * 60 * 1000) // 15 min
const forYouCache = new TTLCache<DiscoverItem[]>(15 * 60 * 1000)

const COMICK_HEADERS: Record<string, string> = {
  'Accept': 'application/json',
  'Referer': 'https://comick.io/',
}

interface ComicKTrendingItem {
  hid: string
  slug: string
  title: string
  cover_url: string
  country: string
  status: number
  last_chapter: number | null
  rating: string | null
  user_follow_count: number
  md_titles: Array<{ title: string }>
  genres: number[]
}

function normalizeDiscoverItem(item: ComicKTrendingItem): DiscoverItem {
  return {
    hid: item.hid,
    slug: item.slug,
    title: item.title,
    coverUrl: item.cover_url || '',
    country: item.country,
    status: item.status,
    lastChapter: item.last_chapter != null ? Math.floor(item.last_chapter) : null,
    rating: item.rating,
    followCount: item.user_follow_count ?? 0,
    altTitles: (item.md_titles ?? []).map((t) => t.title),
    genres: item.genres ?? [],
  }
}

/**
 * Fetch trending comics from ComicK.
 */
export async function fetchTrending(comicTypes?: string[]): Promise<DiscoverItem[]> {
  const cacheKey = `trending-${comicTypes?.join(',') ?? 'all'}`
  const cached = trendingCache.get(cacheKey)
  if (cached) return cached

  const url = new URL(`${COMICK_API_BASE}/top`)
  url.searchParams.set('tachiyomi', 'true')
  url.searchParams.set('type', 'trending')
  if (comicTypes && comicTypes.length > 0) {
    for (const t of comicTypes) {
      url.searchParams.append('comic_types', t)
    }
  }

  try {
    const response = await fetchWithRetry(url.toString(), { headers: COMICK_HEADERS })
    if (!response.ok) {
      log.error('Trending fetch failed:', response.status)
      return []
    }

    const data: ComicKTrendingItem[] = await response.json()
    const results = data.map(normalizeDiscoverItem)
    trendingCache.set(cacheKey, results)
    log.debug('Fetched', results.length, 'trending items')
    return results
  } catch (err) {
    log.error('Trending fetch error:', err)
    return []
  }
}

/**
 * Compute "For You" recommendations based on user's tracked items.
 * Combines genre-based trending search + deduplication.
 */
export async function computeForYou(
  trackedItems: TrackedItem[],
  trackedSlugs: Set<string>
): Promise<DiscoverItem[]> {
  const cached = forYouCache.get('forYou')
  if (cached) return cached

  if (trackedItems.length === 0) return []

  // Count genres across tracked items
  const genreCounts = new Map<string, number>()
  for (const item of trackedItems) {
    for (const genre of item.genres) {
      genreCounts.set(genre, (genreCounts.get(genre) ?? 0) + 1)
    }
  }

  // Get top 3 genres
  const topGenres = [...genreCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([genre]) => genre.toLowerCase().replace(/\s+/g, '-'))

  if (topGenres.length === 0) return []

  log.debug('Top genres for recommendations:', topGenres)

  // Search ComicK for popular manga in user's top genres
  const url = new URL(`${COMICK_API_BASE}/v1.0/search/`)
  url.searchParams.set('tachiyomi', 'true')
  url.searchParams.set('sort', 'follow')
  url.searchParams.set('limit', '50')
  url.searchParams.set('page', '1')
  for (const genre of topGenres) {
    url.searchParams.append('genres', genre)
  }

  try {
    const response = await fetchWithRetry(url.toString(), { headers: COMICK_HEADERS })
    if (!response.ok) {
      log.error('For You fetch failed:', response.status)
      return []
    }

    const data: ComicKTrendingItem[] = await response.json()
    const results = data
      .map(normalizeDiscoverItem)
      .filter((item) => !trackedSlugs.has(item.slug) && !trackedSlugs.has(item.hid))

    forYouCache.set('forYou', results)
    log.debug('Computed', results.length, 'For You recommendations')
    return results
  } catch (err) {
    log.error('For You computation error:', err)
    return []
  }
}
```

- [ ] **Step 3: Add message handlers in index.ts**

Add import:
```typescript
import { fetchTrending, computeForYou } from './discover'
```

Add handlers:
```typescript
    case 'GET_TRENDING': {
      return fetchTrending(message.comicTypes)
    }

    case 'GET_FOR_YOU': {
      const allItems = await storageService.getAll()
      const trackedSlugs = new Set<string>()
      for (const item of allItems) {
        if (item.comickSlug) trackedSlugs.add(item.comickSlug)
        trackedSlugs.add(item.providerId)
      }
      return computeForYou(allItems, trackedSlugs)
    }
```

- [ ] **Step 4: Run tests and commit**

Run: `npm run typecheck && npm run test`

```bash
git add src/background/discover.ts src/background/discover.test.ts src/background/index.ts
git commit -m "feat: add discover service with trending and for-you computation"
```

---

## Task 3: NavRail — Add Discover Entry

**Files:**
- Modify: `src/sidepanel/components/NavRail.tsx`

- [ ] **Step 1: Add Discover to NavView type and TABS array**

Update the NavView type:
```typescript
type NavView = 'general' | 'discover' | 'lists' | 'tags' | 'settings'
```

Add Discover to the TABS array (after 'general'):
```typescript
  {
    view: 'discover',
    label: 'Discover',
    path: 'M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z',
  },
```

- [ ] **Step 2: Commit**

```bash
git add src/sidepanel/components/NavRail.tsx
git commit -m "feat: add Discover entry to NavRail"
```

---

## Task 4: DiscoverCard Component

**Files:**
- Create: `src/sidepanel/components/DiscoverCard.tsx`
- Create: `src/sidepanel/components/DiscoverCard.css`

- [ ] **Step 1: Create DiscoverCard**

Create `src/sidepanel/components/DiscoverCard.tsx`:

```typescript
import type { DiscoverItem } from '@/shared/types'
import { getFormatFromCountry, mapComickStatus } from '@/shared/utils'
import './DiscoverCard.css'

interface DiscoverCardProps {
  item: DiscoverItem
  onTrack: (item: DiscoverItem) => void
  isTracked: boolean
}

const DiscoverCard: React.FC<DiscoverCardProps> = ({ item, onTrack, isTracked }) => {
  const format = getFormatFromCountry(item.country)
  const status = mapComickStatus(item.status)

  return (
    <div className="discover-card">
      <img className="discover-card__cover" src={item.coverUrl} alt={item.title} />
      <div className="discover-card__info">
        <h3 className="discover-card__title">{item.title}</h3>
        <div className="discover-card__meta">
          <span className="discover-card__format">{format}</span>
          {status && <span className="discover-card__status">{status}</span>}
          {item.rating && <span className="discover-card__rating">{item.rating}</span>}
        </div>
        {item.lastChapter != null && (
          <p className="discover-card__chapters">{item.lastChapter} chapters</p>
        )}
        <button
          className={`discover-card__track ${isTracked ? 'discover-card__track--tracked' : ''}`}
          onClick={() => onTrack(item)}
          disabled={isTracked}
        >
          {isTracked ? 'Tracked' : '+ Track'}
        </button>
      </div>
    </div>
  )
}

export default DiscoverCard
```

- [ ] **Step 2: Create DiscoverCard styles**

Create `src/sidepanel/components/DiscoverCard.css`:

```css
.discover-card {
  display: flex;
  gap: 10px;
  padding: 8px;
  border-radius: 8px;
  background: var(--surface, #1a1a2e);
  border: 1px solid var(--border, #2a2a4a);
}

.discover-card__cover {
  width: 60px;
  height: 85px;
  object-fit: cover;
  border-radius: 4px;
  flex-shrink: 0;
}

.discover-card__info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.discover-card__title {
  font-size: 13px;
  font-weight: 600;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.discover-card__meta {
  display: flex;
  gap: 6px;
  font-size: 11px;
  color: var(--text-muted, #a0a0a0);
}

.discover-card__rating {
  color: #f59e0b;
}

.discover-card__chapters {
  font-size: 11px;
  color: var(--text-muted, #a0a0a0);
  margin: 0;
}

.discover-card__track {
  align-self: flex-start;
  margin-top: auto;
  padding: 4px 12px;
  border: 1px solid var(--primary, #e94560);
  border-radius: 4px;
  background: transparent;
  color: var(--primary, #e94560);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}

.discover-card__track:hover:not(:disabled) {
  background: var(--primary, #e94560);
  color: white;
}

.discover-card__track--tracked {
  border-color: var(--text-muted, #a0a0a0);
  color: var(--text-muted, #a0a0a0);
  cursor: default;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/sidepanel/components/DiscoverCard.tsx src/sidepanel/components/DiscoverCard.css
git commit -m "feat: add DiscoverCard component with track button"
```

---

## Task 5: DiscoverView Component

**Files:**
- Create: `src/sidepanel/components/DiscoverView.tsx`
- Create: `src/sidepanel/components/DiscoverView.css`

- [ ] **Step 1: Create DiscoverView**

Create `src/sidepanel/components/DiscoverView.tsx`:

```typescript
import { useState, useEffect } from 'react'
import type { DiscoverItem, TrackedItem } from '@/shared/types'
import { getTrending, getForYou, saveItem, enrichComicK } from '../services/messaging'
import { getFormatFromCountry, mapComickStatus } from '@/shared/utils'
import DiscoverCard from './DiscoverCard'
import './DiscoverView.css'

type SubTab = 'trending' | 'foryou'
type ComicFilter = 'all' | 'manga' | 'manhwa' | 'manhua'

interface DiscoverViewProps {
  trackedItems: TrackedItem[]
  onRefresh: () => void
}

const DiscoverView: React.FC<DiscoverViewProps> = ({ trackedItems, onRefresh }) => {
  const [subTab, setSubTab] = useState<SubTab>('trending')
  const [comicFilter, setComicFilter] = useState<ComicFilter>('all')
  const [trendingItems, setTrendingItems] = useState<DiscoverItem[]>([])
  const [forYouItems, setForYouItems] = useState<DiscoverItem[]>([])
  const [loading, setLoading] = useState(false)
  const [trackingId, setTrackingId] = useState<string | null>(null)

  // Build set of tracked slugs/IDs for "already tracked" detection
  const trackedIds = new Set<string>()
  for (const item of trackedItems) {
    trackedIds.add(item.providerId)
    if (item.comickSlug) trackedIds.add(item.comickSlug)
    if (item.comickHid) trackedIds.add(item.comickHid)
  }

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        if (subTab === 'trending') {
          const types = comicFilter === 'all' ? undefined : [comicFilter]
          const results = await getTrending(types)
          setTrendingItems(results)
        } else {
          const results = await getForYou()
          setForYouItems(results)
        }
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [subTab, comicFilter])

  const handleTrack = async (item: DiscoverItem) => {
    setTrackingId(item.hid)
    try {
      // Enrich with detail data
      const enrichment = await enrichComicK(item.slug)

      const now = Date.now()
      const trackedItem: TrackedItem = {
        provider: 'comick',
        providerId: item.hid,
        mediaType: 'manga',
        format: getFormatFromCountry(item.country),
        titles: {
          main: item.title,
          alt: enrichment?.altTitles ?? item.altTitles,
        },
        coverImage: item.coverUrl,
        progress: { unit: 'chapter', value: '0' },
        lastUrl: '',
        updatedAt: now,
        createdAt: now,
        chaptersWhenAdded: item.lastChapter,
        latestKnownChapters: item.lastChapter,
        lastApiCheck: now,
        notificationsEnabled: false,
        anilistStatus: mapComickStatus(item.status),
        genres: enrichment?.genres ?? [],
        tags: [],
        genresBackfilled: (enrichment?.genres.length ?? 0) > 0,
        comickHid: enrichment?.hid ?? item.hid,
        comickSlug: enrichment?.slug ?? item.slug,
        anilistId: enrichment?.anilistId ?? null,
        pinned: false,
      }

      await saveItem(trackedItem)
      onRefresh()
    } finally {
      setTrackingId(null)
    }
  }

  const displayItems = subTab === 'trending' ? trendingItems : forYouItems

  return (
    <div className="discover">
      <div className="discover__tabs">
        <button
          className={`discover__tab ${subTab === 'trending' ? 'discover__tab--active' : ''}`}
          onClick={() => setSubTab('trending')}
        >
          Trending
        </button>
        <button
          className={`discover__tab ${subTab === 'foryou' ? 'discover__tab--active' : ''}`}
          onClick={() => setSubTab('foryou')}
        >
          For You
        </button>
      </div>

      {subTab === 'trending' && (
        <div className="discover__filters">
          {(['all', 'manga', 'manhwa', 'manhua'] as ComicFilter[]).map((f) => (
            <button
              key={f}
              className={`discover__filter ${comicFilter === f ? 'discover__filter--active' : ''}`}
              onClick={() => setComicFilter(f)}
            >
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      )}

      <div className="discover__list">
        {loading && <p className="discover__loading">Loading...</p>}
        {!loading && displayItems.length === 0 && (
          <p className="discover__empty">
            {subTab === 'foryou'
              ? 'Track some manga first to get personalized recommendations.'
              : 'No trending results found.'}
          </p>
        )}
        {!loading && displayItems.map((item) => (
          <DiscoverCard
            key={item.hid}
            item={item}
            isTracked={trackedIds.has(item.hid) || trackedIds.has(item.slug)}
            onTrack={handleTrack}
          />
        ))}
      </div>
    </div>
  )
}

export default DiscoverView
```

- [ ] **Step 2: Create DiscoverView styles**

Create `src/sidepanel/components/DiscoverView.css`:

```css
.discover {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
  height: 100%;
  overflow-y: auto;
}

.discover__tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid var(--border, #2a2a4a);
  padding-bottom: 8px;
}

.discover__tab {
  padding: 6px 16px;
  border: none;
  background: none;
  color: var(--text-muted, #a0a0a0);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: color 0.15s, border-color 0.15s;
}

.discover__tab--active {
  color: var(--primary, #e94560);
  border-bottom-color: var(--primary, #e94560);
}

.discover__filters {
  display: flex;
  gap: 4px;
}

.discover__filter {
  padding: 4px 10px;
  border: 1px solid var(--border, #2a2a4a);
  border-radius: 12px;
  background: none;
  color: var(--text-muted, #a0a0a0);
  font-size: 11px;
  cursor: pointer;
}

.discover__filter--active {
  background: var(--primary, #e94560);
  border-color: var(--primary, #e94560);
  color: white;
}

.discover__list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.discover__loading,
.discover__empty {
  text-align: center;
  color: var(--text-muted, #a0a0a0);
  font-size: 13px;
  padding: 24px 0;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/sidepanel/components/DiscoverView.tsx src/sidepanel/components/DiscoverView.css
git commit -m "feat: add DiscoverView with trending and for-you sub-tabs"
```

---

## Task 6: Wire Discover View in App.tsx

**Files:**
- Modify: `src/sidepanel/App.tsx`

- [ ] **Step 1: Import DiscoverView and add routing**

Add import:
```typescript
import DiscoverView from './components/DiscoverView'
```

In the view rendering logic, add the Discover case. Find where other views are rendered (general, lists, tags, settings) and add:

```tsx
{view === 'discover' && (
  <DiscoverView
    trackedItems={items}
    onRefresh={refresh}
  />
)}
```

- [ ] **Step 2: Run all checks**

Run: `npm run typecheck && npm run lint && npm run test && npm run build`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add src/sidepanel/App.tsx
git commit -m "feat: wire DiscoverView in App with NavRail routing"
```

---

## Task 7: Full Integration Verification

- [ ] **Step 1: Run all checks**

Run: `npm run typecheck && npm run lint && npm run test && npm run build`

- [ ] **Step 2: Fix any issues and commit**

```bash
git add -A
git commit -m "fix: resolve issues from discover tab implementation"
```
