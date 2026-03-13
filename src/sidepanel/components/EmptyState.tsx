import './EmptyState.css'

interface EmptyStateProps {
  message?: string
}

const EmptyState: React.FC<EmptyStateProps> = ({
  message,
}) => {
  return (
    <div className="empty-state">
      {message ? (
        <p>{message}</p>
      ) : (
        <>
          <svg className="empty-state__icon" width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z"/>
          </svg>
          <p>Start tracking</p>
          <p className="empty-state__hint">
            Visit a manga page and tap <strong>+</strong> to add it
          </p>
        </>
      )}
    </div>
  )
}

export default EmptyState
