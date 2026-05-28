import { describe, it, expect } from 'vitest'
import { buildListTree, depthOf, descendantIds, ancestorIds } from './listTree'
import type { CustomList } from './types'

function makeList(id: string, parentId: string | null, name = id, createdAt = 0): CustomList {
  return {
    id,
    name,
    type: 'manual',
    itemIds: [],
    filters: null,
    parentId,
    createdAt,
    updatedAt: createdAt,
  }
}

describe('buildListTree', () => {
  it('returns roots sorted by createdAt ascending', () => {
    const lists = [
      makeList('b', null, 'B', 200),
      makeList('a', null, 'A', 100),
    ]

    const tree = buildListTree(lists)

    expect(tree.map((n) => n.list.id)).toEqual(['a', 'b'])
    expect(tree[0].depth).toBe(0)
    expect(tree[1].depth).toBe(0)
  })

  it('nests children under their parent and records depth', () => {
    const lists = [
      makeList('root', null, 'Root', 100),
      makeList('child', 'root', 'Child', 200),
      makeList('grandchild', 'child', 'Grandchild', 300),
    ]

    const tree = buildListTree(lists)

    expect(tree).toHaveLength(1)
    expect(tree[0].list.id).toBe('root')
    expect(tree[0].depth).toBe(0)
    expect(tree[0].children).toHaveLength(1)
    expect(tree[0].children[0].list.id).toBe('child')
    expect(tree[0].children[0].depth).toBe(1)
    expect(tree[0].children[0].children[0].list.id).toBe('grandchild')
    expect(tree[0].children[0].children[0].depth).toBe(2)
  })

  it('treats orphaned parentId as root (no crash)', () => {
    const lists = [makeList('orphan', 'missing-parent', 'Orphan', 100)]

    const tree = buildListTree(lists)

    expect(tree).toHaveLength(1)
    expect(tree[0].list.id).toBe('orphan')
    expect(tree[0].depth).toBe(0)
  })
})

describe('depthOf', () => {
  it('returns 0 for a root list', () => {
    const lists = [makeList('root', null)]
    expect(depthOf('root', lists)).toBe(0)
  })

  it('returns 2 for a grandchild', () => {
    const lists = [
      makeList('root', null),
      makeList('child', 'root'),
      makeList('grand', 'child'),
    ]
    expect(depthOf('grand', lists)).toBe(2)
  })

  it('returns 0 for an unknown id', () => {
    expect(depthOf('missing', [])).toBe(0)
  })
})

describe('descendantIds', () => {
  it('returns empty array for a leaf', () => {
    const lists = [makeList('leaf', null)]
    expect(descendantIds('leaf', lists)).toEqual([])
  })

  it('returns all descendants (children + grandchildren)', () => {
    const lists = [
      makeList('root', null),
      makeList('a', 'root'),
      makeList('b', 'root'),
      makeList('a1', 'a'),
    ]
    const ids = descendantIds('root', lists).sort()
    expect(ids).toEqual(['a', 'a1', 'b'])
  })
})

describe('ancestorIds', () => {
  it('returns empty array for a root', () => {
    const lists = [makeList('root', null)]
    expect(ancestorIds('root', lists)).toEqual([])
  })

  it('returns ancestors from immediate parent up to root', () => {
    const lists = [
      makeList('root', null),
      makeList('child', 'root'),
      makeList('grand', 'child'),
    ]
    expect(ancestorIds('grand', lists)).toEqual(['child', 'root'])
  })

  it('terminates on an orphan parentId without infinite loop', () => {
    const lists = [makeList('orphan', 'missing-parent')]
    expect(ancestorIds('orphan', lists)).toEqual([])
  })
})
