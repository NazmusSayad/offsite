import { describe, expect, it } from 'vitest'
import { diff, discard, merge } from './objects.ts'

describe('merge', () => {
  it('merges nested objects key by key', () => {
    expect(merge({ a: { b: 1, c: 2 } }, { a: { c: 3, d: 4 } })).toEqual({
      a: { b: 1, c: 3, d: 4 },
    })
  })

  it('replaces lists as a whole', () => {
    expect(merge({ list: [1, 2, 3] }, { list: [4] })).toEqual({ list: [4] })
  })

  it('replaces an object with a value that is not one', () => {
    expect(merge({ a: { b: 1 } }, { a: null })).toEqual({ a: null })
    expect(merge({ a: { b: 1 } }, { a: [1] })).toEqual({ a: [1] })
  })

  it('replaces a value that is not an object with an object', () => {
    expect(merge({ a: 1 }, { a: { b: 2 } })).toEqual({ a: { b: 2 } })
  })

  it.each([5, null, [1], 'text'])(
    'returns the override when it is %j',
    (over) => {
      expect(merge({ a: 1 }, over)).toEqual(over)
    }
  )

  it('returns the override when the base is not an object', () => {
    expect(merge(5, { a: 1 })).toEqual({ a: 1 })
  })

  it('changes neither input and shares nothing with them', () => {
    const base = { a: { b: 1 }, list: [1] }
    const over = { a: { c: 2 }, other: { d: 3 } }
    const result = merge(base, over)
    expect(base).toEqual({ a: { b: 1 }, list: [1] })
    expect(over).toEqual({ a: { c: 2 }, other: { d: 3 } })
    expect(result).not.toBe(base)
    expect(Reflect.get(Object(result), 'other')).not.toBe(over.other)
    expect(Reflect.get(Object(result), 'list')).not.toBe(base.list)
  })

  it('works on frozen inputs', () => {
    const base = Object.freeze({ a: Object.freeze({ b: 1 }) })
    expect(merge(base, { a: { c: 2 } })).toEqual({ a: { b: 1, c: 2 } })
  })
})

describe('discard', () => {
  it('removes the deepest key that exists along the path', () => {
    const value = { a: { b: { c: 1, d: 2 } } }
    expect(discard(value, ['a', 'b', 'c'])).toEqual(['a', 'b', 'c'])
    expect(value).toEqual({ a: { b: { d: 2 } } })
  })

  it('removes the parent when the last key is missing', () => {
    const value = { a: { b: {} }, keep: 1 }
    expect(discard(value, ['a', 'b', 'missing'])).toEqual(['a', 'b'])
    expect(value).toEqual({ a: {}, keep: 1 })
  })

  it('removes an item from a list', () => {
    const value = { list: ['a', 'b', 'c'] }
    expect(discard(value, ['list', 1])).toEqual(['list', 1])
    expect(value).toEqual({ list: ['a', 'c'] })
  })

  it('returns null when nothing along the path exists', () => {
    const value = { a: 1 }
    expect(discard(value, ['missing'])).toBeNull()
    expect(discard(value, [])).toBeNull()
    expect(discard(5, ['a'])).toBeNull()
    expect(discard(null, ['a'])).toBeNull()
    expect(value).toEqual({ a: 1 })
  })
})

describe('diff', () => {
  it('lists changed, added and removed leaves with their paths', () => {
    expect(
      diff(
        { same: 1, changed: 1, removed: 1, nested: { a: 1, b: 2 } },
        { same: 1, changed: 2, added: 1, nested: { a: 1, b: 3 } },
        []
      )
    ).toEqual([
      { path: ['changed'], before: 1, after: 2 },
      { path: ['removed'], before: 1, after: undefined },
      { path: ['nested', 'b'], before: 2, after: 3 },
      { path: ['added'], before: undefined, after: 1 },
    ])
  })

  it('treats a list as one value', () => {
    expect(diff({ list: [1, 2] }, { list: [1, 3] }, [])).toEqual([
      { path: ['list'], before: [1, 2], after: [1, 3] },
    ])
    expect(diff({ list: [{ a: 1 }] }, { list: [{ a: 1 }] }, [])).toEqual([])
  })

  it('reports a whole object that appears or disappears as one change', () => {
    expect(diff({}, { a: { b: 1 } }, [])).toEqual([
      { path: ['a'], before: undefined, after: { b: 1 } },
    ])
    expect(diff({ a: { b: 1 } }, {}, [])).toEqual([
      { path: ['a'], before: { b: 1 }, after: undefined },
    ])
  })

  it('treats a missing key and an undefined one as the same', () => {
    expect(diff({ a: undefined }, {}, [])).toEqual([])
  })

  it('reports a change at the root when either side is not an object', () => {
    expect(diff({ a: 1 }, 5, [])).toEqual([
      { path: [], before: { a: 1 }, after: 5 },
    ])
    expect(diff(5, 5, [])).toEqual([])
  })

  it('starts from the given path', () => {
    expect(diff({ a: 1 }, { a: 2 }, ['root'])).toEqual([
      { path: ['root', 'a'], before: 1, after: 2 },
    ])
  })
})
