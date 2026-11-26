import { describe, expect, it } from 'vitest'
import { make } from './test-schema.ts'

function withEnv() {
  return make([
    { key: 'base', value: { mode: 'slow' } },
    {
      key: 'env',
      value: { name: 'env', count: 2, records: { a: { hidden: true } } },
      readonly: true,
    },
    { key: 'local', value: { count: 5 } },
  ])
}

describe('readonly layers', () => {
  it('follow layer order like any other layer', () => {
    const config = withEnv()
    expect(config.value.name).toBe('env')
    expect(config.value.count).toBe(5)
  })

  it.each(['put', 'patch'] as const)(
    'throw on %s to that layer, even with force',
    (method) => {
      const config = withEnv()
      const layers = config.layers
      expect(() =>
        config[method]({ name: 'x' }, { layer: 'env', force: true })
      ).toThrow('layer env is readonly')
      expect(config.layers).toBe(layers)
    }
  )

  it('throw when a change touches a value they set, and nothing changes', () => {
    const config = withEnv()
    const layers = config.layers
    expect(() => config.patch({ name: 'x', mode: 'fast' })).toThrow(
      'name is set by the readonly layer env'
    )
    expect(config.layers).toBe(layers)
    expect(config.value.mode).toBe('slow')
  })

  it('let a writable layer above them take the change', () => {
    const config = withEnv()
    config.patch({ count: 9 })
    expect(config.layers[2].value).toEqual({ count: 9 })
    expect(config.layers[1].value).toEqual({
      name: 'env',
      count: 2,
      records: { a: { hidden: true } },
    })
  })

  it('throw when removing a value they set', () => {
    const config = withEnv()
    expect(() => config.put({ ...config.value, records: {} })).toThrow(
      'records.a is set by the readonly layer env'
    )
  })

  it('do not own a bad value they set', () => {
    const config = make([
      { key: 'base', value: {} },
      { key: 'env', value: { mode: 'x' }, readonly: true },
    ])
    config.patch({ mode: 'slow' })
    expect(config.value.mode).toBe('slow')
    expect(config.layers[0].value).toEqual({ mode: 'slow' })
  })

  it('are skipped by prefer first', () => {
    const config = make([
      { key: 'env', value: {}, readonly: true },
      { key: 'base', value: {} },
      { key: 'local', value: {} },
    ])
    config.patch({ name: 'x' })
    expect(config.layers.map((layer) => layer.value)).toEqual([
      {},
      { name: 'x' },
      {},
    ])
  })

  it('are skipped by prefer last', () => {
    const config = make([
      { key: 'base', value: {} },
      { key: 'local', value: {} },
      { key: 'env', value: {}, readonly: true },
    ])
    config.patch({ name: 'x' }, { prefer: 'last' })
    expect(config.layers.map((layer) => layer.value)).toEqual([
      {},
      { name: 'x' },
      {},
    ])
  })

  it('leave no place for a new value when every layer is readonly', () => {
    const config = make([{ key: 'env', value: {}, readonly: true }])
    expect(() => config.patch({ name: 'x' })).toThrow(
      'there is no writable layer for name'
    )
    expect(config.patch({ name: 'app' }).changed).toEqual([])
  })
})
