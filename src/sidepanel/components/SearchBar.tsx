import './SearchBar.css'

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
}

const SearchBar: React.FC<SearchBarProps> = ({ value, onChange }) => {
  return (
    <div className="filter-bar">
      <svg className="filter-bar__icon" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
      </svg>
      <input
        className="filter-bar__input"
        type="text"
        placeholder="Filter by title..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button className="filter-bar__clear" onClick={() => onChange('')}>
          &times;
        </button>
      )}
    </div>
  )
}

export default SearchBar
