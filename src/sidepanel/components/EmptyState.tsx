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
          <p>No items yet</p>
          <p className="empty-state__hint">
            Navigate to a manga page and tap the <strong>+</strong> button to start tracking your progress.
          </p>
        </>
      )}
    </div>
  )
}

export default EmptyState
