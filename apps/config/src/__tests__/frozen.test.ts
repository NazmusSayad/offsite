import { describe, expect, it } from 'vitest'
import { make } from './test-schema.ts'

function deeplyFrozen(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) {
    return true
  }
  return Object.isFrozen(value) && Object.values(value).every(deeplyFrozen)
}

function config() {
  return make([
    { key: 'base', value: { tags: ['a'], nested: { on: false }, mode: 'x' } },
    { key: 'local', value: { records: { a: { hidden: true } } } },
  ])
}

describe('frozen state', () => {
  it('freezes everything the config exposes', () => {
    const subject = config()
    subject.patch({ name: 'x' })
    expect(deeplyFrozen(subject.value)).toBe(true)
    expect(deeplyFrozen(subject.defaults)).toBe(true)
    expect(deeplyFrozen(subject.layers)).toBe(true)
    expect(deeplyFrozen(subject.resolved)).toBe(true)
    expect(deeplyFrozen(subject.dropped)).toBe(true)
    expect(deeplyFrozen(subject.history)).toBe(true)
  })

  it('freezes results and what listeners get', () => {
    const subject = config()
    const received: unknown[] = []
    subject.on('beforeUpdate', (result) => received.push(result))
    subject.on('layerUpdate', (layer, result) => received.push(layer, result))
    subject.on('update', (result) => received.push(result))
    received.push(subject.patch({ name: 'x' }), subject.undo())
    expect(received.every(deeplyFrozen)).toBe(true)
  })

  it('throws when something tries to change the state', () => {
    const subject = config()
    expect(() => {
      subject.value.name = 'x'
    }).toThrow(TypeError)
    expect(() => {
      subject.value.tags.push('b')
    }).toThrow(TypeError)
    expect(() => {
      subject.value.nested.on = true
    }).toThrow(TypeError)
    expect(() => {
      subject.layers[0].key = 'x'
    }).toThrow(TypeError)
    expect(() => {
      subject.layers.pop()
    }).toThrow(TypeError)
    expect(subject.value.name).toBe('app')
  })

  it('does not freeze the objects passed in', () => {
    const value = { name: 'x', nested: { on: true } }
    const subject = make([{ key: 'base', value }])
    const patch = { nested: { level: 2 } }
    subject.patch(patch)
    expect(Object.isFrozen(value)).toBe(false)
    expect(Object.isFrozen(value.nested)).toBe(false)
    expect(Object.isFrozen(patch)).toBe(false)
  })
})
