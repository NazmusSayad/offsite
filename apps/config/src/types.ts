export type InputConfigLayer = {
  key: string
  value: unknown
  readonly?: boolean
}

export type StateConfigLayer = {
  key: string
  value: unknown
  readonly: boolean
}

export type StatePathValue = {
  value: unknown
  default: unknown
  owner: string | null
  readonly: boolean
  layers: StateConfigLayer[]
}

export type StateDroppedValue = {
  layer: string
  path: PropertyKey[]
  message: string
}

export type UpdateValueChange = {
  path: string[]
  before: unknown
  after: unknown
}

export type UpdateChangedLayer = {
  key: string
  value: unknown
  changes: UpdateValueChange[]
}

export type UpdateMethod = 'put' | 'patch' | 'undo' | 'redo'

export type UpdateBehavior = {
  layer?: string
  force?: boolean
  prefer?: 'first' | 'last'
}

export type UpdateOptions<Meta> = UpdateBehavior & { meta?: Meta }

export type UndoOptions<Meta> = { meta?: Meta }

export type UpdateCall<Meta> = {
  method: UpdateMethod
  options: UpdateBehavior
  meta: Meta | undefined
}

export type UpdateResult<Config, Meta> = UpdateCall<Meta> & {
  value: Config
  dropped: StateDroppedValue[]
  changed: UpdateChangedLayer[]
}

export type StateHistoryEntry<Meta> = {
  method: 'put' | 'patch'
  options: UpdateBehavior
  meta: Meta | undefined
  changed: UpdateChangedLayer[]
  at: number
  before: StateConfigLayer[]
  after: StateConfigLayer[]
}

export type StateHistory<Meta> = {
  past: StateHistoryEntry<Meta>[]
  future: StateHistoryEntry<Meta>[]
}

export type InputConfigOptions = { historyLimit?: number }

export type ConfigEvents<Config, Meta> = {
  beforeUpdate: [update: UpdateResult<Config, Meta>]
  layerUpdate: [layer: UpdateChangedLayer, update: UpdateResult<Config, Meta>]
  update: [update: UpdateResult<Config, Meta>]
}

export type ConfigListener<Args extends unknown[]> = (
  ...args: [...Args, anchor: string]
) => void
