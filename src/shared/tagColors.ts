import { TAG_COLORS } from './constants'
import type { CustomTagRegistry } from './types'

export function getNextTagColor(existingTags: CustomTagRegistry): string {
  const usedCount = Object.keys(existingTags).length
  return TAG_COLORS[usedCount % TAG_COLORS.length]
}
