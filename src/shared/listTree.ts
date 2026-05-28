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
