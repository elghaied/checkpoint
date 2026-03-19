import { useState, useEffect, useCallback } from 'react'
import { getLists, createList, updateList, deleteList } from '../services/messaging'
import { DEFAULT_LIST_NAMES, CUSTOM_LISTS_KEY } from '@/shared/constants'
import type { CustomList } from '@/shared/types'

async function fetchLists(): Promise<CustomList[]> {
  let result = await getLists()
  // Create default lists on first access
  if (result.length === 0) {
    for (const name of DEFAULT_LIST_NAMES) {
      await createList({ name, type: 'manual', itemIds: [], filters: null })
    }
    result = await getLists()
  }
  return result
}

export function useCustomLists() {
  const [lists, setLists] = useState<CustomList[]>([])

  useEffect(() => {
    let cancelled = false
    fetchLists().then(result => {
      if (!cancelled) setLists(result)
    }).catch(() => { /* ignore */ })
    return () => { cancelled = true }
  }, [])

  // Listen for storage changes so all instances stay in sync
  useEffect(() => {
    const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (CUSTOM_LISTS_KEY in changes && changes[CUSTOM_LISTS_KEY].newValue) {
        setLists(changes[CUSTOM_LISTS_KEY].newValue as CustomList[])
      }
    }
    chrome.storage.onChanged.addListener(listener)
    return () => chrome.storage.onChanged.removeListener(listener)
  }, [])

  const refresh = useCallback(async () => {
    const result = await fetchLists()
    setLists(result)
  }, [])

  return {
    lists,
    refresh,
    createList: async (input: Omit<CustomList, 'id' | 'createdAt' | 'updatedAt'>) => {
      await createList(input)
      await refresh()
    },
    updateList: async (id: string, updates: Partial<CustomList>) => {
      await updateList(id, updates)
      await refresh()
    },
    deleteList: async (id: string) => {
      await deleteList(id)
      await refresh()
    },
  }
}
