import { deepFreeze } from 'es-toolkit'
import { z } from 'zod'
import { discard, merge } from './objects.ts'
import type { StateConfigLayer, StateDroppedValue } from './types.ts'

export type ResolvedLayers<Config> = {
  value: Config
  layers: StateConfigLayer[]
  resolved: StateConfigLayer[]
  dropped: StateDroppedValue[]
}

export function resolveLayers<Config>(
  schema: z.ZodType<Config>,
  defaults: Config,
  layers: StateConfigLayer[]
): ResolvedLayers<Config> {
  const dropped: StateDroppedValue[] = []
  const resolved: StateConfigLayer[] = []
  let value = structuredClone(defaults)
  for (const layer of layers) {
    const applied = applyLayer(schema, value, layer, dropped)
    value = applied.value
    resolved.push({ ...layer, value: applied.kept })
  }
  return deepFreeze({ value, layers, resolved, dropped })
}

function applyLayer<Config>(
  schema: z.ZodType<Config>,
  base: Config,
  layer: StateConfigLayer,
  dropped: StateDroppedValue[]
) {
  const kept = structuredClone(layer.value)
  for (;;) {
    const result = schema.safeParse(merge(base, kept))
    if (result.success) {
      return { value: result.data, kept }
    }
    const issue = result.error.issues[0]
    const targets =
      issue.code === 'unrecognized_keys'
        ? issue.keys.map((key) => [...issue.path, key])
        : [issue.path]
    for (const target of targets) {
      const removed = discard(kept, target)
      if (removed === null) {
        dropped.push({
          layer: layer.key,
          path: [],
          message: z.prettifyError(result.error),
        })
        return { value: base, kept: {} }
      }
      dropped.push({
        layer: layer.key,
        path: removed,
        message: issue.message,
      })
    }
  }
}

export function addedDrops(
  before: StateDroppedValue[],
  after: StateDroppedValue[],
  layer: string
) {
  const known = new Set(before.map(droppedId))
  return after.filter(
    (item) => item.layer === layer && !known.has(droppedId(item))
  )
}

function droppedId(item: StateDroppedValue) {
  return JSON.stringify([item.layer, item.path.map(String), item.message])
}
