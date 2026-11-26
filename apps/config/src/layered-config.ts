import { deepFreeze, isPlainObject } from 'es-toolkit'
import { get as valueAt, has, set, unset } from 'es-toolkit/compat'
import { z } from 'zod'
import { diff, discard, merge } from './objects.ts'
import type {
  InputConfigLayer,
  UpdateChangedLayer,
  StateConfigLayer,
  StateDroppedValue,
  StatePathValue,
  UpdateOptions,
  UpdateResult,
} from './types.ts'

type State<Config> = {
  value: Config
  layers: StateConfigLayer[]
  resolved: StateConfigLayer[]
  dropped: StateDroppedValue[]
}

export class LayeredConfig<Config> {
  readonly defaults: Config
  #schema: z.ZodType<Config>
  #state: State<Config>
  #layerListeners = new Set<(layer: UpdateChangedLayer) => void>()
  #updateListeners = new Set<(update: UpdateResult<Config>) => void>()

  constructor(schema: z.ZodType<Config>, layers: InputConfigLayer[]) {
    const keys = new Set(layers.map((layer) => layer.key))
    if (keys.size !== layers.length) {
      throw new Error('layer keys must be unique')
    }
    this.#schema = schema
    this.defaults = deepFreeze(schema.parse({}))
    this.#state = this.#resolve(
      layers.map((layer) => ({
        key: layer.key,
        value: structuredClone(layer.value),
        readonly: layer.readonly ?? false,
      }))
    )
  }

  get value() {
    return this.#state.value
  }

  get layers() {
    return this.#state.layers
  }

  get resolved() {
    return this.#state.resolved
  }

  get dropped() {
    return this.#state.dropped
  }

  get(path: string[]): StatePathValue {
    const layers = this.resolved
      .filter((layer) => has(layer.value, path))
      .map((layer) => ({ ...layer, value: valueAt(layer.value, path) }))
    const owner = layers.at(-1)
    return deepFreeze({
      value: valueAt(this.value, path),
      default: valueAt(this.defaults, path),
      owner: owner === undefined ? null : owner.key,
      readonly: owner === undefined ? false : owner.readonly,
      layers,
    })
  }

  put(value: unknown, options: UpdateOptions = {}) {
    if (options.layer === undefined) {
      return this.#putValue(
        structuredClone(value),
        options.force ?? false,
        options.prefer ?? 'first'
      )
    }
    return this.#putLayer(
      this.#writableIndex(options.layer),
      structuredClone(value),
      options.force ?? false
    )
  }

  patch(value: unknown, options: UpdateOptions = {}) {
    if (options.layer === undefined) {
      return this.#putValue(
        merge(this.value, value),
        options.force ?? false,
        options.prefer ?? 'first'
      )
    }
    const index = this.#writableIndex(options.layer)
    return this.#putLayer(
      index,
      merge(this.layers[index].value, value),
      options.force ?? false
    )
  }

  onLayerUpdate(listener: (layer: UpdateChangedLayer) => void) {
    this.#layerListeners.add(listener)
    return () => {
      this.#layerListeners.delete(listener)
    }
  }

  onUpdate(listener: (update: UpdateResult<Config>) => void) {
    this.#updateListeners.add(listener)
    return () => {
      this.#updateListeners.delete(listener)
    }
  }

  #writableIndex(key: string) {
    const index = this.layers.findIndex((layer) => layer.key === key)
    if (index === -1) {
      throw new Error(`there is no layer with key ${key}`)
    }
    if (this.layers[index].readonly) {
      throw new Error(`layer ${key} is readonly`)
    }
    return index
  }

  #putValue(next: unknown, force: boolean, prefer: 'first' | 'last') {
    if (!isPlainObject(next)) {
      throw new Error('the config must be an object')
    }
    const parsed = this.#schema.safeParse(next)
    if (!parsed.success && !force) {
      throw new Error(z.prettifyError(parsed.error))
    }
    const values = this.layers.map((layer) => structuredClone(layer.value))
    const holds = (index: number, path: string[]) =>
      this.layers[index].readonly
        ? has(this.resolved[index].value, path)
        : has(values[index], path)
    const fallback =
      prefer === 'first'
        ? this.layers.findIndex((layer) => !layer.readonly)
        : this.layers.findLastIndex((layer) => !layer.readonly)
    for (const change of diff(this.value, next, [])) {
      const path = change.path.join('.')
      if (change.after === undefined) {
        const fixed = this.layers.find(
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
      const owner = this.layers.findLastIndex((_layer, index) =>
        holds(index, change.path)
      )
      if (owner !== -1 && this.layers[owner].readonly) {
        throw new Error(
          `${path} is set by the readonly layer ${this.layers[owner].key}`
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
    return this.#commit(
      this.layers.map((layer, index) => ({ ...layer, value: values[index] }))
    )
  }

  #putLayer(index: number, value: unknown, force: boolean) {
    const key = this.layers[index].key
    const layers = this.layers.map((layer, i) =>
      i === index ? { ...layer, value } : layer
    )
    if (!force) {
      const before = new Set(this.dropped.map(droppedId))
      const added = this.#resolve(layers).dropped.filter(
        (item) => item.layer === key && !before.has(droppedId(item))
      )
      if (added.length > 0) {
        throw new Error(
          added
            .map(
              (item) => `${item.message} at ${item.path.map(String).join('.')}`
            )
            .join('\n')
        )
      }
    }
    return this.#commit(layers)
  }

  #commit(layers: StateConfigLayer[]): UpdateResult<Config> {
    const changed = layers
      .map((layer, index) => ({
        key: layer.key,
        value: layer.value,
        changes: diff(this.layers[index].value, layer.value, []),
      }))
      .filter((layer) => layer.changes.length > 0)
    this.#state = this.#resolve(layers)
    const update = deepFreeze({
      value: this.value,
      dropped: this.dropped,
      changed,
    })
    if (changed.length === 0) {
      return update
    }
    for (const layer of changed) {
      for (const listener of this.#layerListeners) {
        listener(layer)
      }
    }
    for (const listener of this.#updateListeners) {
      listener(update)
    }
    return update
  }

  #resolve(layers: StateConfigLayer[]): State<Config> {
    const dropped: StateDroppedValue[] = []
    const resolved: StateConfigLayer[] = []
    let value = structuredClone(this.defaults)
    for (const layer of layers) {
      const applied = this.#applyLayer(value, layer, dropped)
      value = applied.value
      resolved.push({ ...layer, value: applied.kept })
    }
    return deepFreeze({ value, layers, resolved, dropped })
  }

  #applyLayer(
    base: Config,
    layer: StateConfigLayer,
    dropped: StateDroppedValue[]
  ) {
    const kept = structuredClone(layer.value)
    for (;;) {
      const result = this.#schema.safeParse(merge(base, kept))
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
}

function droppedId(item: StateDroppedValue) {
  return JSON.stringify([item.layer, item.path.map(String), item.message])
}
