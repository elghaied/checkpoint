import { useState, useEffect, useCallback } from 'react'
import { getCustomTags, updateCustomTags, deleteCustomTag as deleteTagMsg } from '../services/messaging'
import { TAG_COLORS, CUSTOM_TAGS_KEY } from '@/shared/constants'
import type { CustomTagRegistry } from '@/shared/types'

export function useCustomTags() {
  const [tags, setTags] = useState<CustomTagRegistry>({})

  useEffect(() => {
    let cancelled = false
    getCustomTags().then(result => {
      if (!cancelled) setTags(result)
    }).catch(() => { /* ignore */ })
    return () => { cancelled = true }
  }, [])

  // Listen for storage changes so all instances stay in sync
  useEffect(() => {
    const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (CUSTOM_TAGS_KEY in changes && changes[CUSTOM_TAGS_KEY].newValue) {
        setTags(changes[CUSTOM_TAGS_KEY].newValue as CustomTagRegistry)
      }
    }
    chrome.storage.onChanged.addListener(listener)
    return () => chrome.storage.onChanged.removeListener(listener)
  }, [])

  const refresh = useCallback(async () => {
    const result = await getCustomTags()
    setTags(result)
  }, [])

  const getNextColor = useCallback((): string => {
    const usedCount = Object.keys(tags).length
    return TAG_COLORS[usedCount % TAG_COLORS.length]
  }, [tags])

  const updateTag = useCallback(async (name: string, updates: { color?: string; newName?: string }) => {
    await updateCustomTags(name, updates)
    await refresh()
  }, [refresh])

  const deleteTag = useCallback(async (name: string) => {
    await deleteTagMsg(name)
    await refresh()
  }, [refresh])

  return { tags, refresh, getNextColor, updateTag, deleteTag }
}
