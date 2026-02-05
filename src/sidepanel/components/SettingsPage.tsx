import { useState, useRef } from 'react'
import { useSettings } from '../hooks/useSettings'
import { exportData, importData, checkForUpdates } from '../services/messaging'
import type { ExportedData } from '@/shared/types'

interface SettingsPageProps {
  onBack: () => void
}

const SettingsPage: React.FC<SettingsPageProps> = ({ onBack }) => {
  const { settings, loading, updateSettings } = useSettings()
  const [importResult, setImportResult] = useState<{
    imported: number
    updated: number
    skipped: number
  } | null>(null)
  const [isChecking, setIsChecking] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleExport = async () => {
    try {
      const data = await exportData()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `checkpoint-backup-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Export failed:', err)
    }
  }

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      const data: ExportedData = JSON.parse(text)

      // Basic validation
      if (!data.version || !data.source || !Array.isArray(data.items)) {
        throw new Error('Invalid backup file format')
      }

      const result = await importData(data)
      setImportResult(result)

      // Clear the input so the same file can be selected again
      e.target.value = ''
    } catch (err) {
      console.error('Import failed:', err)
      alert(err instanceof Error ? err.message : 'Failed to import backup')
      e.target.value = ''
    }
  }

  const handleCheckNow = async () => {
    try {
      setIsChecking(true)
      await checkForUpdates()
    } catch (err) {
      console.error('Check failed:', err)
    } finally {
      setIsChecking(false)
    }
  }

  if (loading) {
    return (
      <div className="settings-page">
        <div className="settings-page__header">
          <button className="settings-page__back" onClick={onBack}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
            </svg>
          </button>
          <h1 className="settings-page__title">Settings</h1>
        </div>
        <div className="settings-page__content">
          <p>Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="settings-page">
      <div className="settings-page__header">
        <button className="settings-page__back" onClick={onBack}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
          </svg>
        </button>
        <h1 className="settings-page__title">Settings</h1>
      </div>

      <div className="settings-page__content">
        {/* Notifications Section */}
        <div className="settings-section">
          <h2 className="settings-section__title">Notifications</h2>

          <div className="settings-item">
            <div className="settings-item__info">
              <div className="settings-item__label">Enable notifications</div>
              <div className="settings-item__description">
                Master toggle for all chapter release notifications
              </div>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                className="toggle__input"
                checked={settings.globalNotificationsEnabled}
                onChange={(e) => updateSettings({ globalNotificationsEnabled: e.target.checked })}
              />
              <span className="toggle__slider"></span>
            </label>
          </div>

          <div className="settings-item">
            <div className="settings-item__info">
              <div className="settings-item__label">Smart notifications</div>
              <div className="settings-item__description">
                Only notify for chapters released after you started tracking
              </div>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                className="toggle__input"
                checked={settings.notifyOnlyNewReleases}
                onChange={(e) => updateSettings({ notifyOnlyNewReleases: e.target.checked })}
              />
              <span className="toggle__slider"></span>
            </label>
          </div>

          <div className="settings-item">
            <div className="settings-item__info">
              <div className="settings-item__label">Check interval</div>
              <div className="settings-item__description">
                How often to check for new chapters (minutes)
              </div>
            </div>
            <input
              type="number"
              className="settings-item__input"
              min="15"
              max="1440"
              value={settings.checkIntervalMinutes}
              onChange={(e) => {
                const value = parseInt(e.target.value, 10)
                if (value >= 15 && value <= 1440) {
                  updateSettings({ checkIntervalMinutes: value })
                }
              }}
            />
          </div>

          <button
            className="btn btn--secondary"
            style={{ width: '100%', marginTop: '8px' }}
            onClick={handleCheckNow}
            disabled={isChecking}
          >
            {isChecking ? 'Checking...' : 'Check for updates now'}
          </button>
        </div>

        {/* Data Section */}
        <div className="settings-section">
          <h2 className="settings-section__title">Data</h2>

          <div className="settings-actions">
            <button className="btn btn--secondary" onClick={handleExport}>
              Export backup
            </button>
            <button className="btn btn--secondary" onClick={handleImportClick}>
              Import backup
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="settings-file-input"
              onChange={handleFileChange}
            />
          </div>

          {importResult && (
            <div className="import-result">
              <div className="import-result__title">Import complete</div>
              <div className="import-result__stats">
                {importResult.imported} new items imported<br />
                {importResult.updated} items updated<br />
                {importResult.skipped} items skipped (older than existing)
              </div>
            </div>
          )}
        </div>

        {/* About Section */}
        <div className="settings-section">
          <h2 className="settings-section__title">About</h2>
          <div className="settings-item">
            <div className="settings-item__info">
              <div className="settings-item__label">Checkpoint</div>
              <div className="settings-item__description">
                Version 0.1.0 &middot; Track your manga reading progress
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SettingsPage
