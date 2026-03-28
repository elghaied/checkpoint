import type { CustomTagRegistry } from '@/shared/types'
import './TagBadges.css'

interface TagBadgesProps {
  tags: string[]
  tagRegistry: CustomTagRegistry
  maxVisible?: number
}

export function getContrastText(hexColor: string): string {
  if (!hexColor || hexColor.length < 7) return '#ffffff'
  const r = parseInt(hexColor.slice(1, 3), 16)
  const g = parseInt(hexColor.slice(3, 5), 16)
  const b = parseInt(hexColor.slice(5, 7), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.5 ? '#1a1a1a' : '#ffffff'
}

export function TagBadges({ tags, tagRegistry, maxVisible = 3 }: TagBadgesProps) {
  if (!tags || tags.length === 0) return null

  const visible = tags.slice(0, maxVisible)
  const remaining = tags.length - maxVisible

  return (
    <div className="tag-badges">
      {visible.map((tag) => {
        const color = tagRegistry[tag]?.color ?? '#808080'
        return (
          <span
            key={tag}
            className="tag-badges__pill"
            style={{ backgroundColor: color, color: getContrastText(color) }}
          >
            {tag}
          </span>
        )
      })}
      {remaining > 0 && (
        <span className="tag-badges__more">+{remaining}</span>
      )}
    </div>
  )
}
