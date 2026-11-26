export type ConfigIssue = { path: PropertyKey[]; message: string }

export class ConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = new.target.name
  }
}

export class ConfigLayerReadonlyError extends ConfigError {
  readonly layer: string
  readonly path: string[]

  constructor(layer: string, path: string[]) {
    super(
      path.length === 0
        ? `layer ${layer} is readonly`
        : `${path.join('.')} is set by the readonly layer ${layer}`
    )
    this.layer = layer
    this.path = path
  }
}

export class ConfigLayerNotFoundError extends ConfigError {
  readonly layer: string

  constructor(layer: string) {
    super(`there is no layer with key ${layer}`)
    this.layer = layer
  }
}

export class ConfigValidationError extends ConfigError {
  readonly issues: ConfigIssue[]

  constructor(message: string, issues: ConfigIssue[]) {
    super(message)
    this.issues = issues
  }
}

export class ConfigHistoryError extends ConfigError {
  readonly action: 'undo' | 'redo'

  constructor(action: 'undo' | 'redo') {
    super(`there is nothing to ${action}`)
    this.action = action
  }
}
