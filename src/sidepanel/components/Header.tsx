import './Header.css'

interface HeaderProps {
  count: number
}

const Header: React.FC<HeaderProps> = ({ count }) => {
  return (
    <header className="header">
      <div className="header__brand">
        <img className="header__logo" src="/icons/icon32.png" alt="Checkpoint" />
        <h1>Checkpoint</h1>
        <span className="header__badge">{count} tracked</span>
      </div>
    </header>
  )
}

export default Header
