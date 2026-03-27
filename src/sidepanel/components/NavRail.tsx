import './NavRail.css'

type NavView = 'general' | 'discover' | 'lists' | 'tags' | 'settings'

interface NavRailProps {
  activeView: NavView
  onViewChange: (view: NavView) => void
}

const TABS: { view: NavView; label: string; path: string }[] = [
  {
    view: 'general',
    label: 'General',
    path: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z',
  },
  {
    view: 'discover',
    label: 'Discover',
    path: 'M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z',
  },
  {
    view: 'lists',
    label: 'Lists',
    path: 'M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z',
  },
  {
    view: 'tags',
    label: 'Tags',
    path: 'M17.63 5.84C17.27 5.33 16.67 5 16 5L5 5.01C3.9 5.01 3 5.9 3 7v10c0 1.1.9 1.99 2 1.99L16 19c.67 0 1.27-.33 1.63-.84L22 12l-4.37-6.16z',
  },
]

const SETTINGS_TAB = {
  view: 'settings' as NavView,
  label: 'Settings',
  path: 'M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z',
}

function NavTab({
  tab,
  active,
  onViewChange,
}: {
  tab: { view: NavView; label: string; path: string }
  active: boolean
  onViewChange: (view: NavView) => void
}) {
  return (
    <button
      className={`nav-rail__tab${active ? ' nav-rail__tab--active' : ''}`}
      onClick={() => onViewChange(tab.view)}
      aria-label={tab.label}
      aria-current={active ? 'page' : undefined}
    >
      <span className="nav-rail__icon">
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path d={tab.path} />
        </svg>
      </span>
      <span className="nav-rail__tooltip">{tab.label}</span>
    </button>
  )
}

const NavRail: React.FC<NavRailProps> = ({ activeView, onViewChange }) => {
  return (
    <nav className="nav-rail" aria-label="Main navigation">
      <div className="nav-rail__tabs">
        {TABS.map((tab) => (
          <NavTab
            key={tab.view}
            tab={tab}
            active={activeView === tab.view}
            onViewChange={onViewChange}
          />
        ))}
        <NavTab
          tab={SETTINGS_TAB}
          active={activeView === 'settings'}
          onViewChange={onViewChange}
        />
      </div>
    </nav>
  )
}

export type { NavView, NavRailProps }
export default NavRail
