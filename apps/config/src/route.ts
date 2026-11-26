import { isPlainObject } from 'es-toolkit'
import { has, set, unset } from 'es-toolkit/compat'
import { diff } from './objects.ts'
import type { StateConfigLayer } from './types.ts'

export function routeChanges(
  layers: StateConfigLayer[],
  resolved: StateConfigLayer[],
  current: unknown,
  next: unknown,
  prefer: 'first' | 'last'
): StateConfigLayer[] {
  const values = layers.map((layer) => structuredClone(layer.value))
  function holds(index: number, path: string[]) {
    return layers[index].readonly
      ? has(resolved[index].value, path)
      : has(values[index], path)
  }
  const fallback =
    prefer === 'first'
      ? layers.findIndex((layer) => !layer.readonly)
      : layers.findLastIndex((layer) => !layer.readonly)
  for (const change of diff(current, next, [])) {
    const path = change.path.join('.')
    if (change.after === undefined) {
      const fixed = layers.find(
        (layer, index) => layer.readonly && holds(index, change.path)
      )
      if (fixed !== undefined) {
        throw new Error(`${path} is set by the readonly layer ${fixed.key}`)
      }
      for (const value of values) {
        unset(value, change.path)
      }
      continue
    }
    const owner = layers.findLastIndex((_layer, index) =>
      holds(index, change.path)
    )
    if (owner !== -1 && layers[owner].readonly) {
      throw new Error(
        `${path} is set by the readonly layer ${layers[owner].key}`
      )
    }
    if (owner === -1 && fallback === -1) {
      throw new Error(`there is no writable layer for ${path}`)
    }
    const index = owner === -1 ? fallback : owner
    const target = isPlainObject(values[index]) ? values[index] : {}
    set(target, change.path, change.after)
    values[index] = target
  }
  return layers.map((layer, index) => ({ ...layer, value: values[index] }))
}
