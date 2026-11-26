import { describe, expect, it } from 'vitest'
import { routeChanges } from './route.ts'
import type { StateConfigLayer } from './types.ts'

function layer(key: string, value: unknown, readonly = false) {
  return { key, value, readonly }
}

function route(
  layers: StateConfigLayer[],
  current: Record<string, unknown>,
  next: Record<string, unknown>,
  prefer: 'first' | 'last' = 'first',
  resolved = layers
) {
  return routeChanges(layers, resolved, current, next, prefer).map(
    (item) => item.value
  )
}

describe('routeChanges', () => {
  it('sends a change to the highest layer that holds the value', () => {
    expect(
      route(
        [layer('base', { a: 1 }), layer('local', { a: 2 })],
        { a: 2 },
        { a: 3 }
      )
    ).toEqual([{ a: 1 }, { a: 3 }])
  })

  it('sends a value no layer holds to the first or last writable layer', () => {
    const layers = [
      layer('env', {}, true),
      layer('base', {}),
      layer('local', {}),
      layer('lock', {}, true),
    ]
    expect(route(layers, {}, { a: 1 })).toEqual([{}, { a: 1 }, {}, {}])
    expect(route(layers, {}, { a: 1 }, 'last')).toEqual([{}, {}, { a: 1 }, {}])
  })

  it('removes a value from every layer that holds it', () => {
    expect(
      route(
        [layer('base', { a: 1, b: 1 }), layer('local', { a: 2 })],
        { a: 2, b: 1 },
        { b: 1 }
      )
    ).toEqual([{ b: 1 }, {}])
  })

  it('writes nested changes into the existing objects', () => {
    expect(
      route(
        [layer('base', { n: { x: 1, y: 1 } })],
        { n: { x: 1, y: 1 } },
        { n: { x: 1, y: 2 } }
      )
    ).toEqual([{ n: { x: 1, y: 2 } }])
  })

  it('creates the objects a nested change needs', () => {
    expect(route([layer('base', {})], {}, { n: { deep: { x: 1 } } })).toEqual([
      { n: { deep: { x: 1 } } },
    ])
  })

  it('replaces a layer value that is not an object', () => {
    expect(route([layer('base', 'broken')], {}, { a: 1 })).toEqual([{ a: 1 }])
  })

  it('throws when a readonly layer holds the changed value', () => {
    expect(() =>
      route(
        [layer('base', {}), layer('env', { a: 1 }, true)],
        { a: 1 },
        { a: 2 }
      )
    ).toThrow('a is set by the readonly layer env')
  })

  it('throws when removing a value a readonly layer holds', () => {
    expect(() =>
      route(
        [layer('env', { a: 1 }, true), layer('local', { a: 2 })],
        { a: 2 },
        {}
      )
    ).toThrow('a is set by the readonly layer env')
  })

  it('looks at the accepted values of readonly layers only', () => {
    const layers = [layer('base', {}), layer('env', { a: 'bad' }, true)]
    const resolved = [layer('base', {}), layer('env', {}, true)]
    expect(route(layers, {}, { a: 1 }, 'first', resolved)).toEqual([
      { a: 1 },
      { a: 'bad' },
    ])
  })

  it('throws when there is no writable layer for a new value', () => {
    expect(() => route([layer('env', {}, true)], {}, { a: 1 })).toThrow(
      'there is no writable layer for a'
    )
  })

  it('changes neither the layers nor their values', () => {
    const value = { a: 1 }
    const layers = [layer('base', value)]
    route(layers, { a: 1 }, { a: 2 })
    expect(value).toEqual({ a: 1 })
    expect(layers[0].value).toBe(value)
  })
})
