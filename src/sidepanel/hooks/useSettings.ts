import { useState, useEffect, useCallback } from 'react'
import type { ExtensionSettings } from '@/shared/types'
import { DEFAULT_SETTINGS } from '@/shared/types'
import { getSettings, updateSettings as updateSettingsApi } from '../services/messaging'

interface UseSettingsReturn {
  settings: ExtensionSettings
  loading: boolean
  error: string | null
  updateSettings: (updates: Partial<ExtensionSettings>) => Promise<void>
  refresh: () => void
}

export function useSettings(): UseSettingsReturn {
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await getSettings()
      setSettings(data)
    } catch (err) {
      console.error('Failed to fetch settings:', err)
      setError(err instanceof Error ? err.message : 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  const updateSettings = useCallback(async (updates: Partial<ExtensionSettings>) => {
    try {
      setError(null)
      const updated = await updateSettingsApi(updates)
      setSettings(updated)
    } catch (err) {
      console.error('Failed to update settings:', err)
      setError(err instanceof Error ? err.message : 'Failed to update settings')
      throw err
    }
  }, [])

  return {
    settings,
    loading,
    error,
    updateSettings,
    refresh: fetchSettings,
  }
}
