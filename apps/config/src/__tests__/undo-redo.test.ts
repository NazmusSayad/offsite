import { describe, expect, it } from 'vitest'
import { make } from './test-schema.ts'

function twoLayers(historyLimit?: number) {
  return make(
    [
      { key: 'base', value: { name: 'base' } },
      { key: 'local', value: { count: 3 } },
    ],
    historyLimit === undefined ? undefined : { historyLimit }
  )
}

describe('history', () => {
  it('starts empty', () => {
    const config = twoLayers()
    expect(config.history).toEqual({ past: [], future: [] })
    expect(config.canUndo).toBe(false)
    expect(config.canRedo).toBe(false)
  })

  it('records every change with how it happened', () => {
    const config = twoLayers()
    const before = config.layers
    const result = config.patch(
      { count: 4 },
      { prefer: 'last', meta: { source: 'settings' } }
    )
    expect(config.history.past).toEqual([
      {
        method: 'patch',
        options: { layer: undefined, force: undefined, prefer: 'last' },
        meta: { source: 'settings' },
        changed: result.changed,
        at: expect.any(Number),
        before,
        after: config.layers,
      },
    ])
    expect(config.canUndo).toBe(true)
  })

  it('records layer writes, forced ones too', () => {
    const config = twoLayers()
    config.put(
      { mode: 'x' },
      { layer: 'local', force: true, meta: { source: 'file' } }
    )
    expect(config.history.past[0]).toMatchObject({
      method: 'put',
      options: { layer: 'local', force: true },
      meta: { source: 'file' },
    })
  })

  it('does not record a call that changes nothing', () => {
    const config = twoLayers()
    config.patch({ name: 'base' })
    expect(config.history.past).toEqual([])
  })

  it('keeps only the newest entries up to historyLimit', () => {
    const config = twoLayers(2)
    config.patch({ count: 10 })
    config.patch({ count: 11 })
    config.patch({ count: 12 })
    expect(
      config.history.past.map((entry) => entry.changed[0].changes[0].after)
    ).toEqual([11, 12])
  })

  it('records nothing with historyLimit 0', () => {
    const config = twoLayers(0)
    config.patch({ count: 10 })
    expect(config.history.past).toEqual([])
    expect(config.canUndo).toBe(false)
  })

  it('keeps 100 entries by default', () => {
    const config = twoLayers()
    for (let count = 10; count < 115; count += 1) {
      config.patch({ count })
    }
    expect(config.history.past).toHaveLength(100)
  })
})

describe('undo and redo', () => {
  it('undo puts the layers back and redo applies the change again', () => {
    const config = twoLayers()
    const start = config.layers
    config.patch({ count: 4, name: 'x' })
    const after = config.layers
    config.undo()
    expect(config.layers).toEqual(start)
    expect(config.value.count).toBe(3)
    expect(config.canUndo).toBe(false)
    expect(config.canRedo).toBe(true)
    config.redo()
    expect(config.layers).toEqual(after)
    expect(config.value.count).toBe(4)
    expect(config.canUndo).toBe(true)
    expect(config.canRedo).toBe(false)
  })

  it('walks back and forward through several changes', () => {
    const config = twoLayers()
    config.patch({ count: 4 })
    config.patch({ count: 5 })
    config.patch({ count: 6 })
    config.undo()
    config.undo()
    expect(config.value.count).toBe(4)
    expect(config.history.past).toHaveLength(1)
    expect(config.history.future).toHaveLength(2)
    config.redo()
    expect(config.value.count).toBe(5)
  })

  it('restores the exact raw value of a layer, bad values included', () => {
    const config = make([{ key: 'base', value: { mode: 'x', name: 'base' } }])
    config.put({ name: 'clean' }, { layer: 'base' })
    config.undo()
    expect(config.layers[0].value).toEqual({ mode: 'x', name: 'base' })
  })

  it('throws when there is nothing to undo or redo', () => {
    const config = twoLayers()
    expect(() => config.undo()).toThrow('there is nothing to undo')
    expect(() => config.redo()).toThrow('there is nothing to redo')
  })

  it('clears the redo list when a new change is made', () => {
    const config = twoLayers()
    config.patch({ count: 4 })
    config.undo()
    config.patch({ count: 7 })
    expect(config.canRedo).toBe(false)
    expect(() => config.redo()).toThrow('there is nothing to redo')
  })

  it('fires the events with its own method and meta', () => {
    const config = twoLayers()
    config.patch({ count: 4 }, { meta: { source: 'settings' } })
    const seen: unknown[] = []
    config.on('beforeUpdate', (result) => seen.push(result.method))
    config.on('layerUpdate', (layer) => seen.push(layer.key))
    config.on('update', (result) => seen.push(result.meta))
    const result = config.undo({ meta: { source: 'menu' } })
    expect(result.method).toBe('undo')
    expect(result.options).toEqual({})
    expect(seen).toEqual(['undo', 'local', { source: 'menu' }])
    config.redo()
    expect(seen.slice(3)).toEqual(['redo', 'local', undefined])
  })

  it('keeps the original meta on the entry it moves', () => {
    const config = twoLayers()
    config.patch({ count: 4 }, { meta: { source: 'settings' } })
    config.undo({ meta: { source: 'menu' } })
    expect(config.history.future[0].meta).toEqual({ source: 'settings' })
  })

  it('changes nothing when beforeUpdate cancels it', () => {
    const config = twoLayers()
    config.patch({ count: 4 })
    const history = config.history
    config.on('beforeUpdate', () => {
      throw new Error('disk full')
    })
    expect(() => config.undo()).toThrow('disk full')
    expect(config.value.count).toBe(4)
    expect(config.history).toBe(history)
  })

  it('skips validation and readonly checks, since it returns to an accepted state', () => {
    const config = make([
      { key: 'base', value: { mode: 'x' } },
      { key: 'env', value: { name: 'env' }, readonly: true },
    ])
    config.patch({ count: 2 })
    config.undo()
    expect(config.layers[0].value).toEqual({ mode: 'x' })
    expect(config.layers[1].value).toEqual({ name: 'env' })
  })
})
