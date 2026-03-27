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
