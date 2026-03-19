import { useState, useEffect, useCallback } from 'react'
import { getLists, createList, updateList, deleteList } from '../services/messaging'
import { DEFAULT_LIST_NAMES } from '@/shared/constants'
import type { CustomList } from '@/shared/types'

export function useCustomLists() {
  const [lists, setLists] = useState<CustomList[]>([])

  const refresh = useCallback(async () => {
    let result = await getLists()
    // Create default lists on first access
    if (result.length === 0) {
      for (const name of DEFAULT_LIST_NAMES) {
        await createList({ name, type: 'manual', itemIds: [], filters: null })
      }
      result = await getLists()
    }
    setLists(result)
  }, [])

  useEffect(() => { refresh() }, [refresh])

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
