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
