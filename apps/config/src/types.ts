export type StateConfigLayer = { key: string; value: unknown }

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

export type UpdateResult<Config> = {
  value: Config
  dropped: StateDroppedValue[]
  changed: UpdateChangedLayer[]
}

export type UpdateOptions = {
  layer?: string
  force?: boolean
  prefer?: 'first' | 'last'
}
