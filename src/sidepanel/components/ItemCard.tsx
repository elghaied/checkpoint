import { useState } from 'react'
import { TrackedItem } from '@/shared/types'
import { toggleItemNotifications } from '../services/messaging'
import { createLogger } from '@/shared/logger'
import { GenreBadges } from './GenreBadges'
import './ItemCard.css'

const log = createLogger('app')

interface ItemCardProps {
  item: TrackedItem
  index: number
  onEdit: () => void
  onOpen: () => void
  onToggleNotifications?: (enabled: boolean) => void
  onTogglePin?: () => void
}

function formatUpdatedAt(timestamp: number): string {
  const now = Date.now()
  const diffMs = now - timestamp
  const diffMins = Math.floor(diffMs / 60_000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`

  return new Date(timestamp).toLocaleDateString()
}

const ItemCard: React.FC<ItemCardProps> = ({ item, index, onEdit, onOpen, onToggleNotifications, onTogglePin }) => {
  const [bellLoading, setBellLoading] = useState(false)

  const progressLabel =
    item.progress.unit === 'chapter'
      ? `Chapter ${item.progress.value}`
      : `Episode ${item.progress.value}`

  // Calculate chapters ahead
  const userProgress = parseFloat(item.progress.value) || 0
  const latestChapters = item.latestKnownChapters ?? 0
  const chaptersAhead = Math.max(0, Math.round((latestChapters - userProgress) * 10) / 10)

  const handleBellClick = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (bellLoading) return
    const newEnabled = !item.notificationsEnabled
    setBellLoading(true)
    try {
      await toggleItemNotifications(item.providerId, newEnabled)
      onToggleNotifications?.(newEnabled)
    } catch (err) {
      log.error('Failed to toggle notifications:', err)
    } finally {
      setBellLoading(false)
    }
  }

  return (
    <div className="item-card" style={{ animationDelay: `${Math.min(index, 10) * 0.05}s` }}>
      <div className="item-card__cover-wrap">
        <img
          className="item-card__cover"
          src={item.coverImage}
          alt={`Cover for ${item.titles.main}`}
        />
      </div>
      <div className="item-card__info">
        <div className="item-card__header">
          <h3 className="item-card__title">{item.titles.main}</h3>
          <button
            className={`item-card__pin ${item.pinned ? 'item-card__pin--active' : ''}`}
            onClick={(e) => { e.stopPropagation(); onTogglePin?.() }}
            title={item.pinned ? 'Unpin' : 'Pin to top'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
            </svg>
          </button>
          <button
            className={`item-card__bell ${item.notificationsEnabled ? 'item-card__bell--active' : ''}${bellLoading ? ' item-card__bell--loading' : ''}`}
            onClick={handleBellClick}
            disabled={bellLoading}
            title={item.notificationsEnabled ? 'Notifications on' : 'Notifications off'}
          >
            {item.notificationsEnabled ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z" opacity="0.4"/>
              </svg>
            )}
          </button>
        </div>
        <GenreBadges genres={item.genres} />
        <div className="item-card__progress-row">
          <p className="item-card__progress">{progressLabel}</p>
          {chaptersAhead > 0 && (
            <span className="item-card__ahead">+{chaptersAhead} ahead</span>
          )}
        </div>
        {item.latestKnownChapters != null && item.latestKnownChapters > 0 && (
          <div className="item-card__progress-bar">
            <div className="item-card__progress-bar-fill" style={{ width: `${Math.min(100, (userProgress / latestChapters) * 100)}%` }} />
          </div>
        )}
        <p className="item-card__updated">{formatUpdatedAt(item.updatedAt)}</p>
        <div className="item-card__actions">
          <button className="item-card__btn item-card__btn--edit" onClick={onEdit}>
            Edit
          </button>
          <button className="item-card__btn item-card__btn--open" onClick={onOpen}>
            Open
          </button>
        </div>
      </div>
    </div>
  )
}

export default ItemCard
