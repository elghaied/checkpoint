interface AddButtonProps {
  onClick: () => void
  disabled?: boolean
  loading?: boolean
}

const AddButton: React.FC<AddButtonProps> = ({ onClick, disabled, loading }) => {
  return (
    <button
      className="add-button"
      onClick={onClick}
      disabled={disabled || loading}
      title="Add current page"
    >
      {loading ? (
        <span className="add-button__spinner" />
      ) : (
        <span className="add-button__icon">+</span>
      )}
    </button>
  )
}

export default AddButton
