import type { CustomList } from './types'

export interface ListNode {
  list: CustomList
  children: ListNode[]
  depth: number
}

/**
 * Build an in-memory tree from a flat array of CustomList records.
 * Roots are sorted by createdAt ascending. Children within each parent
 * are sorted by createdAt ascending. A list whose parentId points to a
 * non-existent id is surfaced as a root (no crash, no data loss).
 */
export function buildListTree(lists: CustomList[]): ListNode[] {
  const byId = new Map<string, CustomList>()
  for (const list of lists) byId.set(list.id, list)

  const childrenByParent = new Map<string | null, CustomList[]>()
  for (const list of lists) {
    const parentKey = list.parentId !== null && byId.has(list.parentId) ? list.parentId : null
    const bucket = childrenByParent.get(parentKey) ?? []
    bucket.push(list)
    childrenByParent.set(parentKey, bucket)
  }

  function build(parentId: string | null, depth: number): ListNode[] {
    const kids = childrenByParent.get(parentId) ?? []
    kids.sort((a, b) => a.createdAt - b.createdAt)
    return kids.map((list) => ({
      list,
      depth,
      children: build(list.id, depth + 1),
    }))
  }

  return build(null, 0)
}

/**
 * Number of ancestors above a list (0 for root). Unknown id returns 0.
 * Cycle-safe via a visited set in case storage is somehow corrupted.
 */
export function depthOf(listId: string, lists: CustomList[]): number {
  const byId = new Map(lists.map((l) => [l.id, l]))
  let current = byId.get(listId)
  let depth = 0
  const seen = new Set<string>()
  while (current && current.parentId !== null) {
    if (seen.has(current.id)) break
    seen.add(current.id)
    const parent = byId.get(current.parentId)
    if (!parent) break
    depth++
    current = parent
  }
  return depth
}

/**
 * All descendant ids reachable via parentId pointers (children, grandchildren, ...).
 * Order is breadth-first but callers should not rely on order.
 */
export function descendantIds(listId: string, lists: CustomList[]): string[] {
  const childrenByParent = new Map<string, string[]>()
  for (const l of lists) {
    if (l.parentId === null) continue
    const arr = childrenByParent.get(l.parentId) ?? []
    arr.push(l.id)
    childrenByParent.set(l.parentId, arr)
  }
  const out: string[] = []
  const queue: string[] = [...(childrenByParent.get(listId) ?? [])]
  while (queue.length > 0) {
    const id = queue.shift()!
    out.push(id)
    const kids = childrenByParent.get(id) ?? []
    queue.push(...kids)
  }
  return out
}

/**
 * Maximum number of additional levels below the given list (0 if leaf).
 * "Below" excludes the list itself.
 */
export function subtreeMaxDepthBelow(listId: string, lists: CustomList[]): number {
  const childrenByParent = new Map<string, string[]>()
  for (const l of lists) {
    if (l.parentId === null) continue
    const arr = childrenByParent.get(l.parentId) ?? []
    arr.push(l.id)
    childrenByParent.set(l.parentId, arr)
  }
  function walk(id: string): number {
    const kids = childrenByParent.get(id) ?? []
    if (kids.length === 0) return 0
    let best = 0
    for (const k of kids) {
      const d = 1 + walk(k)
      if (d > best) best = d
    }
    return best
  }
  return walk(listId)
}

/**
 * Ancestor ids from immediate parent up to the root. Cycle-safe.
 */
export function ancestorIds(listId: string, lists: CustomList[]): string[] {
  const byId = new Map(lists.map((l) => [l.id, l]))
  const out: string[] = []
  const seen = new Set<string>()
  let current = byId.get(listId)
  while (current && current.parentId !== null && !seen.has(current.id)) {
    seen.add(current.id)
    const parent = byId.get(current.parentId)
    if (!parent) break
    out.push(parent.id)
    current = parent
  }
  return out
}

export interface FlatSearchResult {
  list: CustomList
  /** Ancestor names from root → parent joined with " / "; empty string for root-level lists. */
  path: string
}

/**
 * Flat, global list-name search for the folder browser. Case-insensitive substring
 * match on every list's name, anywhere in the tree. Each result carries the path of
 * its ancestors so the UI can show where the match lives. Results sorted by name.
 * Empty/whitespace query returns [].
 */
export function searchListsFlat(lists: CustomList[], query: string): FlatSearchResult[] {
  const trimmed = query.trim().toLowerCase()
  if (trimmed === '') return []

  const byId = new Map(lists.map((l) => [l.id, l]))
  const results = lists
    .filter((l) => l.name.toLowerCase().includes(trimmed))
    .map((list) => {
      const path = ancestorIds(list.id, lists)
        .slice()
        .reverse()
        .map((id) => byId.get(id)?.name ?? '')
        .filter(Boolean)
        .join(' / ')
      return { list, path }
    })

  results.sort((a, b) => a.list.name.localeCompare(b.list.name))
  return results
}

export interface SearchFilterResult {
  /** Ids of lists that should remain visible in the tree. */
  visibleIds: Set<string>
  /** Ids of non-matching lists that should auto-expand because a descendant matches. */
  autoExpandedIds: Set<string>
}

/**
 * Compute which lists stay visible under a search query, and which non-matching
 * lists should auto-expand because they have a matching descendant.
 *
 * An empty query returns an empty `autoExpandedIds` and a visibleIds set containing
 * every list (callers should treat that as "show everything as-is").
 */
export function filterListTreeBySearch(
  lists: CustomList[],
  query: string,
): SearchFilterResult {
  const visibleIds = new Set<string>()
  const autoExpandedIds = new Set<string>()

  const trimmed = query.trim().toLowerCase()
  if (trimmed === '') {
    for (const l of lists) visibleIds.add(l.id)
    return { visibleIds, autoExpandedIds }
  }

  const matches = new Set<string>()
  for (const l of lists) {
    if (l.name.toLowerCase().includes(trimmed)) {
      matches.add(l.id)
    }
  }

  // Every match is visible. Every ancestor of a match is also visible and auto-expanded.
  for (const matchId of matches) {
    visibleIds.add(matchId)
    for (const ancestorId of ancestorIds(matchId, lists)) {
      visibleIds.add(ancestorId)
      if (!matches.has(ancestorId)) autoExpandedIds.add(ancestorId)
    }
  }

  return { visibleIds, autoExpandedIds }
}
