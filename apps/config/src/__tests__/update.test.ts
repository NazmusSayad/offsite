import { describe, expect, it } from 'vitest'
import { make } from './test-schema.ts'

function twoLayers() {
  return make([
    { key: 'base', value: { name: 'base', nested: { on: false } } },
    { key: 'local', value: { count: 3 } },
  ])
}

describe('patch without a layer', () => {
  it('saves a change to the layer the value comes from', () => {
    const config = twoLayers()
    config.patch({ count: 7 })
    expect(config.value.count).toBe(7)
    expect(config.layers[1].value).toEqual({ count: 7 })
    expect(config.layers[0].value).toEqual({
      name: 'base',
      nested: { on: false },
    })
  })

  it('saves a value no layer sets to the first layer', () => {
    const config = twoLayers()
    config.patch({ mode: 'slow' })
    expect(config.layers[0].value).toEqual({
      name: 'base',
      nested: { on: false },
      mode: 'slow',
    })
    expect(config.layers[1].value).toEqual({ count: 3 })
  })

  it('saves a value no layer sets to the last layer with prefer last', () => {
    const config = twoLayers()
    config.patch({ mode: 'slow', name: 'renamed' }, { prefer: 'last' })
    expect(config.layers[1].value).toEqual({ count: 3, mode: 'slow' })
    expect(config.layers[0].value).toEqual({
      name: 'renamed',
      nested: { on: false },
    })
  })

  it('keeps the other keys of a nested object', () => {
    const config = twoLayers()
    config.patch({ nested: { level: 5 } })
    expect(config.value.nested).toEqual({ on: false, level: 5 })
    expect(config.layers[0].value).toEqual({
      name: 'base',
      nested: { on: false, level: 5 },
    })
  })

  it('replaces a list as a whole', () => {
    const config = make([{ key: 'base', value: { tags: ['a', 'b'] } }])
    config.patch({ tags: ['c'] })
    expect(config.value.tags).toEqual(['c'])
    expect(config.layers[0].value).toEqual({ tags: ['c'] })
  })

  it('adds a record entry', () => {
    const config = make([{ key: 'base', value: {} }])
    config.patch({ records: { 'v5.1': { hidden: true } } })
    expect(config.layers[0].value).toEqual({
      records: { 'v5.1': { hidden: true } },
    })
  })

  it('fixes a bad value in the layer that holds it', () => {
    const config = make([
      { key: 'base', value: {} },
      { key: 'local', value: { mode: 'x' } },
    ])
    config.patch({ mode: 'slow' })
    expect(config.layers[1].value).toEqual({ mode: 'slow' })
    expect(config.dropped).toEqual([])
  })

  it('lists what changed in each layer', () => {
    const result = twoLayers().patch({ count: 7, mode: 'slow' })
    expect(result.changed).toEqual([
      {
        key: 'base',
        value: { name: 'base', nested: { on: false }, mode: 'slow' },
        changes: [{ path: ['mode'], before: undefined, after: 'slow' }],
      },
      {
        key: 'local',
        value: { count: 7 },
        changes: [{ path: ['count'], before: 3, after: 7 }],
      },
    ])
    expect(result.value.count).toBe(7)
    expect(result.dropped).toEqual([])
  })

  it('throws on a bad value and changes nothing', () => {
    const config = twoLayers()
    const layers = config.layers
    expect(() => config.patch({ count: -1 })).toThrow('Too small')
    expect(config.layers).toBe(layers)
    expect(config.value.count).toBe(3)
  })

  it('saves a bad value with force and ignores it', () => {
    const config = twoLayers()
    const result = config.patch({ count: -1 }, { force: true })
    expect(config.layers[1].value).toEqual({ count: -1 })
    expect(config.value.count).toBe(1)
    expect(result.dropped.map((item) => [item.layer, item.path])).toEqual([
      ['local', ['count']],
    ])
  })

  it('changes nothing when the values are the same', () => {
    const config = twoLayers()
    const layers = config.layers
    const result = config.patch({ count: 3 })
    expect(result.changed).toEqual([])
    expect(config.layers).toEqual(layers)
  })

  it('copies the value it is given', () => {
    const config = twoLayers()
    const patch = { nested: { level: 5 } }
    config.patch(patch)
    patch.nested.level = 9
    expect(config.value.nested.level).toBe(5)
  })

  it('turns a layer that is not an object into one when saving to it', () => {
    const config = make([{ key: 'base', value: [1] }])
    config.patch({ name: 'fixed' })
    expect(config.layers[0].value).toEqual({ name: 'fixed' })
    expect(config.value.name).toBe('fixed')
  })
})

describe('put without a layer', () => {
  it('replaces the whole config', () => {
    const config = twoLayers()
    config.put({ ...config.value, count: 9, mode: 'slow' })
    expect(config.value.count).toBe(9)
    expect(config.value.mode).toBe('slow')
  })

  it('removes a value that is left out from every layer', () => {
    const config = make([
      { key: 'base', value: { note: 'base' } },
      { key: 'local', value: { note: 'local' } },
    ])
    const next: Record<string, unknown> = { ...config.value }
    delete next.note
    config.put(next)
    expect(config.value.note).toBeNull()
    expect(config.layers.map((layer) => layer.value)).toEqual([{}, {}])
  })

  it('removes a record entry from every layer', () => {
    const config = make([
      { key: 'base', value: { records: { a: { hidden: true } } } },
      { key: 'local', value: { records: { a: { hidden: false } } } },
    ])
    config.put({ ...config.value, records: {} })
    expect(config.value.records).toEqual({})
    expect(config.layers.map((layer) => layer.value)).toEqual([
      { records: {} },
      { records: {} },
    ])
  })

  it('throws on a bad value', () => {
    const config = twoLayers()
    expect(() => config.put({ ...config.value, mode: 'x' })).toThrow(
      'Invalid option'
    )
  })

  it.each([5, [1], null, 'text'])(
    'throws when the config is %j, even with force',
    (value) => {
      const config = twoLayers()
      expect(() => config.put(value, { force: true })).toThrow(
        'the config must be an object'
      )
    }
  )
})

describe('put and patch with a layer', () => {
  it('put replaces the raw value of that layer', () => {
    const config = twoLayers()
    config.put({ mode: 'slow' }, { layer: 'local' })
    expect(config.layers[1].value).toEqual({ mode: 'slow' })
    expect(config.value.count).toBe(1)
    expect(config.value.mode).toBe('slow')
  })

  it('patch deep merges into the raw value of that layer', () => {
    const config = twoLayers()
    config.patch({ nested: { level: 2 } }, { layer: 'base' })
    expect(config.layers[0].value).toEqual({
      name: 'base',
      nested: { on: false, level: 2 },
    })
  })

  it('patch writes the layer even when a higher layer hides the value', () => {
    const config = twoLayers()
    config.patch({ count: 8 }, { layer: 'base' })
    expect(config.layers[0].value).toMatchObject({ count: 8 })
    expect(config.value.count).toBe(3)
  })

  it('throws on a new bad value and changes nothing', () => {
    const config = twoLayers()
    const layers = config.layers
    expect(() => config.patch({ mode: 'x' }, { layer: 'local' })).toThrow(
      'Invalid option'
    )
    expect(config.layers).toBe(layers)
  })

  it('does not throw for a bad value that was already there', () => {
    const config = make([{ key: 'base', value: { mode: 'x' } }])
    config.patch({ name: 'renamed' }, { layer: 'base' })
    expect(config.layers[0].value).toEqual({ mode: 'x', name: 'renamed' })
    expect(config.value.name).toBe('renamed')
  })

  it('saves a bad value with force and ignores it', () => {
    const config = twoLayers()
    const result = config.put(
      { mode: 'x', name: 'local' },
      { layer: 'local', force: true }
    )
    expect(config.layers[1].value).toEqual({ mode: 'x', name: 'local' })
    expect(config.value.name).toBe('local')
    expect(config.value.mode).toBe('fast')
    expect(result.dropped.map((item) => item.path)).toEqual([['mode']])
  })

  it('throws on an unknown layer', () => {
    expect(() => twoLayers().put({}, { layer: 'missing' })).toThrow(
      'there is no layer with key missing'
    )
    expect(() => twoLayers().patch({}, { layer: 'missing' })).toThrow(
      'there is no layer with key missing'
    )
  })

  it('reports the changes of the layer', () => {
    const result = twoLayers().put({ mode: 'slow' }, { layer: 'local' })
    expect(result.changed).toEqual([
      {
        key: 'local',
        value: { mode: 'slow' },
        changes: [
          { path: ['count'], before: 3, after: undefined },
          { path: ['mode'], before: undefined, after: 'slow' },
        ],
      },
    ])
  })
})

describe('the result of put and patch', () => {
  it('describes the call', () => {
    const result = twoLayers().patch(
      { count: 4 },
      { prefer: 'last', meta: { source: 'test' } }
    )
    expect(result.method).toBe('patch')
    expect(result.options).toEqual({
      layer: undefined,
      force: undefined,
      prefer: 'last',
    })
    expect(result.meta).toEqual({ source: 'test' })
  })

  it('has no meta when none is given', () => {
    const result = twoLayers().put({ name: 'x' }, { layer: 'base' })
    expect(result.method).toBe('put')
    expect(result.meta).toBeUndefined()
  })
})
