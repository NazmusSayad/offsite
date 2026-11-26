import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { addedDrops, resolveLayers } from './resolve.ts'

const schema = z.strictObject({
  a: z.number().default(1),
  b: z.enum(['x', 'y']).default('x'),
})
const defaults = schema.parse({})

function layer(key: string, value: unknown) {
  return { key, value, readonly: false }
}

describe('resolveLayers', () => {
  it('applies each layer over the ones before it', () => {
    const result = resolveLayers(schema, defaults, [
      layer('base', { a: 2, b: 'y' }),
      layer('local', { a: 3 }),
    ])
    expect(result.value).toEqual({ a: 3, b: 'y' })
    expect(result.resolved.map((item) => item.value)).toEqual([
      { a: 2, b: 'y' },
      { a: 3 },
    ])
    expect(result.dropped).toEqual([])
  })

  it('drops bad values and unknown keys and reports each', () => {
    const result = resolveLayers(schema, defaults, [
      layer('base', { a: 'two', b: 'y', c: 1 }),
    ])
    expect(result.value).toEqual({ a: 1, b: 'y' })
    expect(result.resolved[0].value).toEqual({ b: 'y' })
    expect(
      result.dropped.map((item) => item.path.join('.')).toSorted()
    ).toEqual(['a', 'c'])
  })

  it('drops a layer that is not an object as a whole', () => {
    const result = resolveLayers(schema, defaults, [layer('base', 'text')])
    expect(result.value).toEqual(defaults)
    expect(result.resolved[0].value).toEqual({})
    expect(result.dropped).toEqual([
      { layer: 'base', path: [], message: expect.any(String) },
    ])
  })

  it('keeps the layers it was given and freezes the result', () => {
    const value = { a: 'two' }
    const result = resolveLayers(schema, defaults, [layer('base', value)])
    expect(result.layers[0].value).toBe(value)
    expect(value).toEqual({ a: 'two' })
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.value)).toBe(true)
  })
})

describe('addedDrops', () => {
  const old = { layer: 'base', path: ['a'], message: 'bad' }

  it('returns the drops of a layer that were not there before', () => {
    const added = { layer: 'base', path: ['b'], message: 'bad' }
    expect(addedDrops([old], [old, added], 'base')).toEqual([added])
  })

  it('ignores drops of other layers', () => {
    const other = { layer: 'local', path: ['b'], message: 'bad' }
    expect(addedDrops([], [other], 'base')).toEqual([])
  })

  it('treats a drop with a new message as new', () => {
    const changed = { layer: 'base', path: ['a'], message: 'worse' }
    expect(addedDrops([old], [changed], 'base')).toEqual([changed])
  })
})
