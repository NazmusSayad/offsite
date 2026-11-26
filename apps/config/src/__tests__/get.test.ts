import { describe, expect, it } from 'vitest'
import { make } from './test-schema.ts'

function config() {
  return make([
    {
      key: 'base',
      value: {
        name: 'base',
        mode: 'medium',
        nested: { on: false },
        records: { 'v5.1': { hidden: true } },
      },
    },
    { key: 'env', value: { count: 4, name: 'env' }, readonly: true },
    { key: 'local', value: { name: 'local', nested: { level: 2 } } },
  ])
}

describe('get', () => {
  it('describes a value that several layers set', () => {
    expect(config().get(['name'])).toEqual({
      value: 'local',
      default: 'app',
      owner: 'local',
      readonly: false,
      layers: [
        { key: 'base', value: 'base', readonly: false },
        { key: 'env', value: 'env', readonly: true },
        { key: 'local', value: 'local', readonly: false },
      ],
    })
  })

  it('marks a value that comes from a readonly layer', () => {
    expect(config().get(['count'])).toEqual({
      value: 4,
      default: 1,
      owner: 'env',
      readonly: true,
      layers: [{ key: 'env', value: 4, readonly: true }],
    })
  })

  it('has no owner for a value that only the defaults set', () => {
    expect(config().get(['tags'])).toEqual({
      value: [],
      default: [],
      owner: null,
      readonly: false,
      layers: [],
    })
  })

  it('ignores a bad value when finding the owner', () => {
    expect(config().get(['mode'])).toEqual({
      value: 'fast',
      default: 'fast',
      owner: null,
      readonly: false,
      layers: [],
    })
  })

  it('names the highest layer that sets anything inside an object', () => {
    const result = config().get(['nested'])
    expect(result.value).toEqual({ on: false, level: 2 })
    expect(result.owner).toBe('local')
    expect(result.layers).toEqual([
      { key: 'base', value: { on: false }, readonly: false },
      { key: 'local', value: { level: 2 }, readonly: false },
    ])
  })

  it('reads a nested value', () => {
    const result = config().get(['nested', 'on'])
    expect(result.value).toBe(false)
    expect(result.owner).toBe('base')
  })

  it('reads a key that contains a dot', () => {
    const result = config().get(['records', 'v5.1'])
    expect(result.value).toEqual({ hidden: true })
    expect(result.owner).toBe('base')
  })

  it('returns nothing for a path that does not exist', () => {
    expect(config().get(['missing', 'path'])).toEqual({
      value: undefined,
      default: undefined,
      owner: null,
      readonly: false,
      layers: [],
    })
  })

  it('returns a frozen result', () => {
    const result = config().get(['nested'])
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.value)).toBe(true)
    expect(Object.isFrozen(result.layers[0])).toBe(true)
  })
})
