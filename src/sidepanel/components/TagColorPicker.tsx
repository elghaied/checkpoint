import { TAG_COLORS } from '@/shared/constants'
import './TagColorPicker.css'

interface TagColorPickerProps {
  currentColor: string
  onSelect: (color: string) => void
  onClose: () => void
}

const TagColorPicker: React.FC<TagColorPickerProps> = ({ currentColor, onSelect, onClose }) => {
  const handleSelect = (color: string) => {
    onSelect(color)
    onClose()
  }

  return (
    <div
      className="tag-color-picker"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="tag-color-picker__grid">
        {TAG_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            className={`tag-color-picker__swatch${color === currentColor ? ' tag-color-picker__swatch--active' : ''}`}
            style={{ backgroundColor: color }}
            onClick={() => handleSelect(color)}
            title={color}
          />
        ))}
      </div>
    </div>
  )
}

export default TagColorPicker
