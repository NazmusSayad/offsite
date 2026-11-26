import { noop } from 'es-toolkit'
import { describe, expect, it } from 'vitest'
import { make } from './test-schema.ts'

function twoLayers() {
  return make([
    { key: 'base', value: { name: 'base' } },
    { key: 'local', value: { count: 3 } },
  ])
}

describe('on and off', () => {
  it('returns an anchor made of the event and a counter per config', () => {
    const config = twoLayers()
    expect(config.on('update', noop)).toBe('update:1')
    expect(config.on('beforeUpdate', noop)).toBe('beforeUpdate:2')
    expect(config.on('layerUpdate', noop)).toBe('layerUpdate:3')
    expect(twoLayers().on('update', noop)).toBe('update:1')
  })

  it('passes the anchor as the last argument', () => {
    const config = twoLayers()
    const received: unknown[][] = []
    const before = config.on('beforeUpdate', (...args) => received.push(args))
    const layer = config.on('layerUpdate', (...args) => received.push(args))
    const update = config.on('update', (...args) => received.push(args))
    const result = config.patch({ name: 'x' })
    expect(received).toEqual([
      [result, before],
      [result.changed[0], result, layer],
      [result, update],
    ])
  })

  it('fires beforeUpdate, then layerUpdate per changed layer, then update', () => {
    const config = twoLayers()
    const order: string[] = []
    config.on('update', () => order.push('update'))
    config.on('layerUpdate', (layer) => order.push(`layer ${layer.key}`))
    config.on('beforeUpdate', () => order.push('before'))
    config.patch({ name: 'x', count: 4 })
    expect(order).toEqual(['before', 'layer base', 'layer local', 'update'])
  })

  it('shows the old state in beforeUpdate and the new one after', () => {
    const config = twoLayers()
    const seen: string[] = []
    config.on('beforeUpdate', (result) =>
      seen.push(`before ${config.value.name} -> ${result.value.name}`)
    )
    config.on('layerUpdate', () => seen.push(`layer ${config.value.name}`))
    config.on('update', () =>
      seen.push(`update ${config.value.name} ${config.history.past.length}`)
    )
    config.patch({ name: 'x' })
    expect(seen).toEqual(['before base -> x', 'layer x', 'update x 1'])
  })

  it('cancels the change when beforeUpdate throws', () => {
    const config = twoLayers()
    const layers = config.layers
    const fired: string[] = []
    config.on('beforeUpdate', () => {
      throw new Error('disk full')
    })
    config.on('layerUpdate', () => fired.push('layer'))
    config.on('update', () => fired.push('update'))
    expect(() => config.patch({ name: 'x' })).toThrow('disk full')
    expect(config.layers).toBe(layers)
    expect(config.value.name).toBe('base')
    expect(config.history.past).toEqual([])
    expect(fired).toEqual([])
  })

  it('fires nothing when nothing changes', () => {
    const config = twoLayers()
    const fired: string[] = []
    config.on('beforeUpdate', () => fired.push('before'))
    config.on('layerUpdate', () => fired.push('layer'))
    config.on('update', () => fired.push('update'))
    config.patch({ name: 'base' })
    expect(fired).toEqual([])
  })

  it('stops calling a listener after off', () => {
    const config = twoLayers()
    let calls = 0
    const anchor = config.on('update', () => {
      calls += 1
    })
    config.patch({ name: 'x' })
    config.off(anchor)
    config.patch({ name: 'y' })
    expect(calls).toBe(1)
  })

  it('does nothing for an unknown anchor or one already removed', () => {
    const config = twoLayers()
    const anchor = config.on('update', noop)
    config.off(anchor)
    expect(() => config.off(anchor)).not.toThrow()
    expect(() => config.off('update:99')).not.toThrow()
  })

  it('lets a listener remove itself and still runs the others', () => {
    const config = twoLayers()
    const calls: string[] = []
    config.on('update', (_result, anchor) => {
      calls.push('once')
      config.off(anchor)
    })
    config.on('update', () => calls.push('always'))
    config.patch({ name: 'x' })
    config.patch({ name: 'y' })
    expect(calls).toEqual(['once', 'always', 'always'])
  })

  it('lets a listener remove another one for later events', () => {
    const config = twoLayers()
    const calls: string[] = []
    const later = config.on('update', () => calls.push('update'))
    config.on('beforeUpdate', () => {
      calls.push('before')
      config.off(later)
    })
    config.patch({ name: 'x' })
    expect(calls).toEqual(['before'])
  })

  it('runs every listener of an event that was there when it fired', () => {
    const config = twoLayers()
    const calls: string[] = []
    let second = ''
    config.on('update', () => {
      calls.push('first')
      config.off(second)
    })
    second = config.on('update', () => calls.push('second'))
    config.patch({ name: 'x' })
    config.patch({ name: 'y' })
    expect(calls).toEqual(['first', 'second', 'first'])
  })

  it('passes meta and the method to every listener', () => {
    const config = twoLayers()
    const seen: unknown[] = []
    config.on('beforeUpdate', (result) => seen.push(result.meta))
    config.on('layerUpdate', (_layer, result) => seen.push(result.method))
    config.on('update', (result) => seen.push(result.options.prefer))
    config.patch({ tags: ['a'] }, { prefer: 'last', meta: { source: 'test' } })
    expect(seen).toEqual([{ source: 'test' }, 'patch', 'last'])
  })
})
