import { describe, expect, it } from 'vitest'
import { make, schema } from './test-schema.ts'

const defaults = schema.parse({})

describe('building the config from layers', () => {
  it('is the schema defaults when there are no layers', () => {
    const config = make([])
    expect(config.value).toEqual(defaults)
    expect(config.defaults).toEqual(defaults)
    expect(config.layers).toEqual([])
    expect(config.resolved).toEqual([])
    expect(config.dropped).toEqual([])
  })

  it('throws when two layers have the same key', () => {
    expect(() =>
      make([
        { key: 'a', value: {} },
        { key: 'a', value: {} },
      ])
    ).toThrow('layer keys must be unique')
  })

  it('lets each layer override the ones before it', () => {
    const config = make([
      { key: 'base', value: { name: 'base', count: 2 } },
      { key: 'local', value: { name: 'local' } },
    ])
    expect(config.value.name).toBe('local')
    expect(config.value.count).toBe(2)
    expect(config.value.mode).toBe('fast')
  })

  it('merges nested objects key by key', () => {
    const config = make([
      { key: 'base', value: { nested: { on: false } } },
      { key: 'local', value: { nested: { level: 3 } } },
    ])
    expect(config.value.nested).toEqual({ on: false, level: 3 })
  })

  it('replaces lists as a whole', () => {
    const config = make([
      { key: 'base', value: { tags: ['a', 'b'] } },
      { key: 'local', value: { tags: ['c'] } },
    ])
    expect(config.value.tags).toEqual(['c'])
  })

  it('merges records key by key', () => {
    const config = make([
      { key: 'base', value: { records: { a: { hidden: true } } } },
      { key: 'local', value: { records: { b: { hidden: false } } } },
    ])
    expect(config.value.records).toEqual({
      a: { hidden: true },
      b: { hidden: false },
    })
  })

  it('lets a layer set a value back to null', () => {
    const config = make([
      { key: 'base', value: { note: 'hello' } },
      { key: 'local', value: { note: null } },
    ])
    expect(config.value.note).toBeNull()
  })

  it('copies the layers it is given', () => {
    const value = { name: 'base', nested: { on: false } }
    const config = make([{ key: 'base', value }])
    value.name = 'changed'
    value.nested.on = true
    expect(config.value.name).toBe('base')
    expect(config.layers[0].value).toEqual({
      name: 'base',
      nested: { on: false },
    })
  })

  it('marks layers writable unless they are readonly', () => {
    const config = make([
      { key: 'base', value: {} },
      { key: 'env', value: {}, readonly: true },
    ])
    expect(config.layers.map((layer) => layer.readonly)).toEqual([false, true])
    expect(config.resolved.map((layer) => layer.readonly)).toEqual([
      false,
      true,
    ])
  })
})

describe('bad values in layers', () => {
  it('ignores a bad value and keeps the rest of the layer', () => {
    const config = make([
      { key: 'base', value: { name: 'base', mode: 'medium' } },
    ])
    expect(config.value.name).toBe('base')
    expect(config.value.mode).toBe('fast')
    expect(config.dropped).toEqual([
      {
        layer: 'base',
        path: ['mode'],
        message: expect.stringContaining('Invalid option'),
      },
    ])
  })

  it('falls back to the value of the layer below, not the default', () => {
    const config = make([
      { key: 'base', value: { count: 5 } },
      { key: 'local', value: { count: -1 } },
    ])
    expect(config.value.count).toBe(5)
    expect(config.dropped.map((item) => item.path)).toEqual([['count']])
  })

  it('ignores unknown keys', () => {
    const config = make([{ key: 'base', value: { name: 'base', extra: 1 } }])
    expect(config.value).toEqual({ ...defaults, name: 'base' })
    expect(config.dropped).toEqual([
      {
        layer: 'base',
        path: ['extra'],
        message: expect.stringContaining('Unrecognized key'),
      },
    ])
  })

  it('ignores a bad nested value and keeps its siblings', () => {
    const config = make([
      { key: 'base', value: { nested: { on: 'yes', level: 2 } } },
    ])
    expect(config.value.nested).toEqual({ on: true, level: 2 })
    expect(config.dropped.map((item) => item.path)).toEqual([['nested', 'on']])
  })

  it('removes only the bad item of a list', () => {
    const config = make([{ key: 'base', value: { tags: [1, 'a'] } }])
    expect(config.value.tags).toEqual(['a'])
    expect(config.dropped.map((item) => item.path)).toEqual([['tags', 0]])
  })

  it('removes a record entry that is missing a required field', () => {
    const config = make([
      {
        key: 'base',
        value: { records: { a: { hidden: true }, b: {} } },
      },
    ])
    expect(config.value.records).toEqual({ a: { hidden: true } })
    expect(config.dropped.map((item) => item.path)).toEqual([['records', 'b']])
  })

  it('ignores several bad values in one layer', () => {
    const config = make([
      { key: 'base', value: { count: 0, mode: 'x', name: 'base', y: 1 } },
    ])
    expect(config.value).toEqual({ ...defaults, name: 'base' })
    expect(
      config.dropped.map((item) => item.path.join('.')).toSorted()
    ).toEqual(['count', 'mode', 'y'])
  })

  it.each([
    ['a number', 5],
    ['a list', [1]],
    ['null', null],
    ['a string', 'text'],
  ])('ignores the whole layer when it is %s', (_label, value) => {
    const config = make([
      { key: 'base', value: { name: 'base' } },
      { key: 'local', value },
    ])
    expect(config.value.name).toBe('base')
    expect(config.dropped).toEqual([
      { layer: 'local', path: [], message: expect.any(String) },
    ])
    expect(config.resolved[1].value).toEqual({})
  })

  it('keeps bad values in the raw layer and leaves them out of resolved', () => {
    const config = make([{ key: 'base', value: { name: 'base', mode: 'x' } }])
    expect(config.layers[0].value).toEqual({ name: 'base', mode: 'x' })
    expect(config.resolved[0].value).toEqual({ name: 'base' })
  })

  it('reports bad values of every layer', () => {
    const config = make([
      { key: 'base', value: { mode: 'x' } },
      { key: 'local', value: { count: 'two' } },
    ])
    expect(
      config.dropped.map((item) => [item.layer, item.path.join('.')])
    ).toEqual([
      ['base', 'mode'],
      ['local', 'count'],
    ])
  })
})

describe('options', () => {
  it.each([-1, 1.5, Number.NaN])('rejects historyLimit %s', (historyLimit) => {
    expect(() => make([], { historyLimit })).toThrow(
      'historyLimit must be a whole number of 0 or more'
    )
  })
})
