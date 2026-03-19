import './GenreBadges.css'

interface GenreBadgesProps {
  genres: string[]
  maxVisible?: number
}

export function GenreBadges({ genres, maxVisible = 3 }: GenreBadgesProps) {
  if (!genres || genres.length === 0) return null

  const visible = genres.slice(0, maxVisible)
  const remaining = genres.length - maxVisible

  return (
    <div className="genre-badges">
      {visible.map((genre) => (
        <span key={genre} className="genre-badges__pill">
          {genre}
        </span>
      ))}
      {remaining > 0 && (
        <span className="genre-badges__more">+{remaining}</span>
      )}
    </div>
  )
}
