import { deepFreeze, isPlainObject } from 'es-toolkit'
import { get as valueAt, has } from 'es-toolkit/compat'
import { z } from 'zod'
import { type RecordedCall, updateCall } from './call.ts'
import { record, redone, undone } from './history.ts'
import { diff, merge } from './objects.ts'
import { addedDrops, resolveLayers, type ResolvedLayers } from './resolve.ts'
import { routeChanges } from './route.ts'
import type {
  ConfigEvents,
  ConfigListener,
  InputConfigLayer,
  InputConfigOptions,
  StateConfigLayer,
  StateHistory,
  StatePathValue,
  UndoOptions,
  UpdateCall,
  UpdateChangedLayer,
  UpdateOptions,
  UpdateResult,
} from './types.ts'

type State<Config, Meta> = ResolvedLayers<Config> & {
  history: StateHistory<Meta>
}

type Listeners<Config, Meta> = {
  [Event in keyof ConfigEvents<Config, Meta>]: Map<
    string,
    ConfigListener<ConfigEvents<Config, Meta>[Event]>
  >
}

export class LayeredConfig<Config, Meta = unknown> {
  readonly defaults: Config
  #schema: z.ZodType<Config>
  #historyLimit: number
  #state: State<Config, Meta>
  #anchorCount = 0
  #listeners: Listeners<Config, Meta> = {
    beforeUpdate: new Map(),
    layerUpdate: new Map(),
    update: new Map(),
  }

  constructor(
    schema: z.ZodType<Config>,
    layers: InputConfigLayer[],
    options: InputConfigOptions = {}
  ) {
    const keys = new Set(layers.map((layer) => layer.key))
    if (keys.size !== layers.length) {
      throw new Error('layer keys must be unique')
    }
    const historyLimit = options.historyLimit ?? 100
    if (!Number.isInteger(historyLimit) || historyLimit < 0) {
      throw new Error('historyLimit must be a whole number of 0 or more')
    }
    this.#schema = schema
    this.#historyLimit = historyLimit
    this.defaults = deepFreeze(schema.parse({}))
    const resolved = resolveLayers(
      this.#schema,
      this.defaults,
      layers.map((layer) => ({
        key: layer.key,
        value: structuredClone(layer.value),
        readonly: layer.readonly ?? false,
      }))
    )
    this.#state = deepFreeze({ ...resolved, history: { past: [], future: [] } })
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

  get history() {
    return this.#state.history
  }

  get canUndo() {
    return this.history.past.length > 0
  }

  get canRedo() {
    return this.history.future.length > 0
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

  put(value: unknown, options: UpdateOptions<Meta> = {}) {
    const call = updateCall('put', options)
    if (options.layer === undefined) {
      return this.#putValue(structuredClone(value), call)
    }
    return this.#putLayer(
      this.#writableIndex(options.layer),
      structuredClone(value),
      call
    )
  }

  patch(value: unknown, options: UpdateOptions<Meta> = {}) {
    const call = updateCall('patch', options)
    if (options.layer === undefined) {
      return this.#putValue(merge(this.value, value), call)
    }
    const index = this.#writableIndex(options.layer)
    return this.#putLayer(index, merge(this.layers[index].value, value), call)
  }

  undo(options: UndoOptions<Meta> = {}) {
    const entry = this.history.past.at(-1)
    if (entry === undefined) {
      throw new Error('there is nothing to undo')
    }
    return this.#commit(
      entry.before,
      { method: 'undo', options: {}, meta: options.meta },
      () => undone(this.history, entry)
    )
  }

  redo(options: UndoOptions<Meta> = {}) {
    const entry = this.history.future.at(0)
    if (entry === undefined) {
      throw new Error('there is nothing to redo')
    }
    return this.#commit(
      entry.after,
      { method: 'redo', options: {}, meta: options.meta },
      () => redone(this.history, entry)
    )
  }

  on<Event extends keyof ConfigEvents<Config, Meta>>(
    event: Event,
    listener: ConfigListener<ConfigEvents<Config, Meta>[Event]>
  ) {
    this.#anchorCount += 1
    const anchor = `${event}:${this.#anchorCount}`
    this.#listeners[event].set(anchor, listener)
    return anchor
  }

  off(anchor: string) {
    this.#listeners.beforeUpdate.delete(anchor)
    this.#listeners.layerUpdate.delete(anchor)
    this.#listeners.update.delete(anchor)
  }

  #emit<Event extends keyof ConfigEvents<Config, Meta>>(
    event: Event,
    ...args: ConfigEvents<Config, Meta>[Event]
  ) {
    for (const entry of [...this.#listeners[event]]) {
      entry[1](...args, entry[0])
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

  #putValue(next: unknown, call: RecordedCall<Meta>) {
    if (!isPlainObject(next)) {
      throw new Error('the config must be an object')
    }
    const parsed = this.#schema.safeParse(next)
    if (!parsed.success && call.options.force !== true) {
      throw new Error(z.prettifyError(parsed.error))
    }
    return this.#commitRecorded(
      routeChanges(
        this.layers,
        this.resolved,
        this.value,
        next,
        call.options.prefer ?? 'first'
      ),
      call
    )
  }

  #putLayer(index: number, value: unknown, call: RecordedCall<Meta>) {
    const key = this.layers[index].key
    const layers = this.layers.map((layer, i) =>
      i === index ? { ...layer, value } : layer
    )
    if (call.options.force !== true) {
      const added = addedDrops(
        this.dropped,
        resolveLayers(this.#schema, this.defaults, layers).dropped,
        key
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
    return this.#commitRecorded(layers, call)
  }

  #commitRecorded(layers: StateConfigLayer[], call: RecordedCall<Meta>) {
    const before = this.layers
    return this.#commit(layers, call, (changed) => {
      const entry = {
        method: call.method,
        options: call.options,
        meta: call.meta,
        changed,
        at: Date.now(),
        before,
        after: layers,
      }
      return record(this.history, entry, this.#historyLimit)
    })
  }

  #commit(
    layers: StateConfigLayer[],
    call: UpdateCall<Meta>,
    nextHistory: (changed: UpdateChangedLayer[]) => StateHistory<Meta>
  ): UpdateResult<Config, Meta> {
    const changed = layers
      .map((layer, index) => ({
        key: layer.key,
        value: layer.value,
        changes: diff(this.layers[index].value, layer.value, []),
      }))
      .filter((layer) => layer.changes.length > 0)
    const resolved = resolveLayers(this.#schema, this.defaults, layers)
    const update = deepFreeze({
      ...call,
      value: resolved.value,
      dropped: resolved.dropped,
      changed,
    })
    const recorded = call.method === 'put' || call.method === 'patch'
    const history =
      changed.length === 0 && recorded ? this.history : nextHistory(changed)
    if (changed.length > 0) {
      this.#emit('beforeUpdate', update)
    }
    this.#state = deepFreeze({ ...resolved, history })
    if (changed.length === 0) {
      return update
    }
    for (const layer of changed) {
      this.#emit('layerUpdate', layer, update)
    }
    this.#emit('update', update)
    return update
  }
}
