import { useState, useRef } from 'react'
import { useSettings } from '../hooks/useSettings'
import { exportData, importData, checkForUpdates } from '../services/messaging'
import type { ExportedData, ImportResult } from '@/shared/types'
import { createLogger } from '@/shared/logger'
import './SettingsPage.css'

const log = createLogger('app')

interface SettingsPageProps {
  onBack: () => void
}

const SettingsPage: React.FC<SettingsPageProps> = ({ onBack }) => {
  const { settings, loading, updateSettings } = useSettings()
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
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
      log.error('Export failed:', err)
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
      log.error('Import failed:', err)
      alert(err instanceof Error ? err.message : 'Failed to import backup')
      e.target.value = ''
    }
  }

  const handleCheckNow = async () => {
    try {
      setIsChecking(true)
      await checkForUpdates()
    } catch (err) {
      log.error('Check failed:', err)
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
          <h2 className="settings-section__title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>
            Notifications
          </h2>

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
          <h2 className="settings-section__title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3C7.58 3 4 4.79 4 7v10c0 2.21 3.58 4 8 4s8-1.79 8-4V7c0-2.21-3.58-4-8-4zm0 2c3.87 0 6 1.5 6 2s-2.13 2-6 2-6-1.5-6-2 2.13-2 6-2zm6 12c0 .5-2.13 2-6 2s-6-1.5-6-2v-2.23c1.61.78 3.72 1.23 6 1.23s4.39-.45 6-1.23V17zm0-5c0 .5-2.13 2-6 2s-6-1.5-6-2V9.77C7.61 10.55 9.72 11 12 11s4.39-.45 6-1.23V12z"/></svg>
            Data
          </h2>

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
              <div className="import-result__header">
                <div className="import-result__title">Import complete</div>
                <button
                  className="import-result__dismiss"
                  onClick={() => setImportResult(null)}
                  aria-label="Dismiss"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                  </svg>
                </button>
              </div>
              <div className="import-result__stats">
                {importResult.imported} added, {importResult.updated} updated, {importResult.skipped} skipped
              </div>
              {importResult.details.importedTitles.length > 0 && (
                <div className="import-result__group">
                  <div className="import-result__group-label">Added</div>
                  <ul className="import-result__list">
                    {importResult.details.importedTitles.map((title) => (
                      <li key={title}>{title}</li>
                    ))}
                  </ul>
                </div>
              )}
              {importResult.details.updatedTitles.length > 0 && (
                <div className="import-result__group">
                  <div className="import-result__group-label">Updated</div>
                  <ul className="import-result__list">
                    {importResult.details.updatedTitles.map((title) => (
                      <li key={title}>{title}</li>
                    ))}
                  </ul>
                </div>
              )}
              {importResult.details.skippedTitles.length > 0 && (
                <div className="import-result__group">
                  <div className="import-result__group-label">Skipped</div>
                  <ul className="import-result__list">
                    {importResult.details.skippedTitles.map((title) => (
                      <li key={title}>{title}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* About Section */}
        <div className="settings-section">
          <h2 className="settings-section__title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
            About
          </h2>
          <div className="settings-item">
            <div className="settings-item__info">
              <div className="settings-item__label">Checkpoint</div>
              <div className="settings-item__description">
                Version {chrome.runtime.getManifest().version} &middot; Track your manga reading progress
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SettingsPage
