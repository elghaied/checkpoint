import type { MessageRequest, MessageResponse, UnifiedSearchResult, TrackedItem, CustomTagRegistry } from '@/shared/types'
import type { ImportSearchRateLimited } from '@/shared/importTypes'

async function sendMessage<T>(message: MessageRequest): Promise<T> {
  const response = await chrome.runtime.sendMessage(message) as MessageResponse<T>
  if ('error' in response) {
    throw new Error(response.error)
  }
  return response.data
}

export async function importSearch(
  query: string,
  extractedTitle: string
): Promise<UnifiedSearchResult[] | ImportSearchRateLimited> {
  return sendMessage<UnifiedSearchResult[] | ImportSearchRateLimited>({
    type: 'IMPORT_SEARCH',
    query,
    extractedTitle,
  })
}

export async function setImportStatus(active: boolean): Promise<void> {
  return sendMessage<void>({ type: 'IMPORT_STATUS', active })
}

export async function saveItem(item: TrackedItem): Promise<void> {
  return sendMessage<void>({ type: 'SAVE_ITEM', item })
}

export async function updateItem(providerId: string, updates: Partial<TrackedItem>): Promise<void> {
  return sendMessage<void>({ type: 'UPDATE_ITEM', providerId, updates })
}

export async function getAllItems(): Promise<TrackedItem[]> {
  return sendMessage<TrackedItem[]>({ type: 'GET_ALL_ITEMS' })
}

export async function getCustomTags(): Promise<CustomTagRegistry> {
  return sendMessage<CustomTagRegistry>({ type: 'GET_CUSTOM_TAGS' })
}

export async function saveCustomTag(tagName: string, color: string): Promise<void> {
  return sendMessage<void>({ type: 'UPDATE_CUSTOM_TAGS', tagName, updates: { color } })
}
