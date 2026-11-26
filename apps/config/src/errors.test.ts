import { describe, expect, it } from 'vitest'
import {
  ConfigError,
  ConfigHistoryError,
  ConfigLayerNotFoundError,
  ConfigLayerReadonlyError,
  ConfigValidationError,
} from './errors.ts'

describe('config errors', () => {
  it('are all ConfigError and Error, named after their class', () => {
    const errors = [
      new ConfigError('x'),
      new ConfigLayerReadonlyError('env', []),
      new ConfigLayerNotFoundError('missing'),
      new ConfigValidationError('bad', []),
      new ConfigHistoryError('undo'),
    ]
    for (const error of errors) {
      expect(error).toBeInstanceOf(Error)
      expect(error).toBeInstanceOf(ConfigError)
      expect(error.name).toBe(error.constructor.name)
    }
  })

  it('ConfigLayerReadonlyError names the layer, and the path when there is one', () => {
    const layer = new ConfigLayerReadonlyError('env', [])
    expect(layer.message).toBe('layer env is readonly')
    expect(layer.layer).toBe('env')
    expect(layer.path).toEqual([])
    const value = new ConfigLayerReadonlyError('env', ['nested', 'on'])
    expect(value.message).toBe('nested.on is set by the readonly layer env')
    expect(value.path).toEqual(['nested', 'on'])
  })

  it('ConfigLayerNotFoundError names the layer', () => {
    const error = new ConfigLayerNotFoundError('missing')
    expect(error.message).toBe('there is no layer with key missing')
    expect(error.layer).toBe('missing')
  })

  it('ConfigValidationError keeps the issues', () => {
    const issues = [{ path: ['count'], message: 'too small' }]
    const error = new ConfigValidationError('bad config', issues)
    expect(error.message).toBe('bad config')
    expect(error.issues).toEqual(issues)
  })

  it('ConfigHistoryError says what there is nothing to do', () => {
    expect(new ConfigHistoryError('undo').message).toBe(
      'there is nothing to undo'
    )
    expect(new ConfigHistoryError('redo').action).toBe('redo')
  })
})
