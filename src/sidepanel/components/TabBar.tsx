import { TrackedItem } from '@/shared/types'

type Format = TrackedItem['format']
type TabValue = Format | 'ALL'

const TABS: TabValue[] = ['ALL', 'MANGA', 'MANHWA', 'MANHUA']

interface TabBarProps {
  activeTab: TabValue
  onTabChange: (tab: TabValue) => void
}

export type { TabValue }

const TabBar: React.FC<TabBarProps> = ({ activeTab, onTabChange }) => {
  return (
    <div className="tab-bar">
      {TABS.map((tab) => (
        <button
          key={tab}
          className={`tab${tab === activeTab ? ' tab--active' : ''}`}
          onClick={() => onTabChange(tab)}
        >
          {tab.charAt(0) + tab.slice(1).toLowerCase()}
        </button>
      ))}
    </div>
  )
}

export default TabBar
