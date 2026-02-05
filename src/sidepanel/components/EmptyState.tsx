interface EmptyStateProps {
  message?: string
}

const EmptyState: React.FC<EmptyStateProps> = ({
  message = 'No items yet. Start reading a manga, manhwa, or manhua and add it here to track your progress.',
}) => {
  return (
    <div className="empty-state">
      <p>{message}</p>
    </div>
  )
}

export default EmptyState
