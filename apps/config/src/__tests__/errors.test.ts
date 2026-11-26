import { describe, expect, it } from 'vitest'
import {
  ConfigError,
  ConfigHistoryError,
  ConfigLayerNotFoundError,
  ConfigLayerReadonlyError,
  ConfigValidationError,
} from '../index.ts'
import { make } from './test-schema.ts'

function caught(action: () => unknown) {
  try {
    action()
  } catch (error) {
    return error
  }
  throw new Error('expected the action to throw')
}

function withEnv() {
  return make([
    { key: 'base', value: { mode: 'x' } },
    { key: 'env', value: { name: 'env' }, readonly: true },
  ])
}

describe('errors thrown by the config', () => {
  it('throws ConfigError for duplicate layer keys and a bad historyLimit', () => {
    const duplicate = caught(() =>
      make([
        { key: 'a', value: {} },
        { key: 'a', value: {} },
      ])
    )
    expect(duplicate).toBeInstanceOf(ConfigError)
    expect(caught(() => make([], { historyLimit: -1 }))).toBeInstanceOf(
      ConfigError
    )
  })

  it.each(['put', 'patch'] as const)(
    'throws ConfigLayerReadonlyError on %s to a readonly layer',
    (method) => {
      const error = caught(() =>
        withEnv()[method]({ name: 'x' }, { layer: 'env' })
      )
      expect(error).toBeInstanceOf(ConfigLayerReadonlyError)
      expect(error).toMatchObject({ layer: 'env', path: [] })
    }
  )

  it('throws ConfigLayerReadonlyError when changing a value a readonly layer sets', () => {
    const error = caught(() => withEnv().patch({ name: 'x' }))
    expect(error).toBeInstanceOf(ConfigLayerReadonlyError)
    expect(error).toMatchObject({ layer: 'env', path: ['name'] })
  })

  it('throws ConfigLayerReadonlyError when removing a value a readonly layer sets', () => {
    const config = withEnv()
    const next: Record<string, unknown> = { ...config.value }
    delete next.name
    const error = caught(() => config.put(next))
    expect(error).toBeInstanceOf(ConfigLayerReadonlyError)
    expect(error).toMatchObject({ layer: 'env', path: ['name'] })
  })

  it('throws ConfigError when no layer can take a new value', () => {
    const config = make([{ key: 'env', value: {}, readonly: true }])
    const error = caught(() => config.patch({ name: 'x' }))
    expect(error).toBeInstanceOf(ConfigError)
    expect(error).not.toBeInstanceOf(ConfigLayerReadonlyError)
  })

  it.each(['put', 'patch'] as const)(
    'throws ConfigLayerNotFoundError on %s to an unknown layer',
    (method) => {
      const error = caught(() => withEnv()[method]({}, { layer: 'missing' }))
      expect(error).toBeInstanceOf(ConfigLayerNotFoundError)
      expect(error).toMatchObject({ layer: 'missing' })
    }
  )

  it('throws ConfigValidationError with every issue of a bad config', () => {
    const config = withEnv()
    const error = caught(() =>
      config.put({ ...config.value, count: 0, mode: 'x' })
    )
    expect(error).toBeInstanceOf(ConfigValidationError)
    expect(error).toMatchObject({
      issues: [
        { path: ['count'], message: expect.stringContaining('Too small') },
        { path: ['mode'], message: expect.stringContaining('Invalid option') },
      ],
    })
  })

  it('throws ConfigValidationError for a new bad value in a layer', () => {
    const error = caught(() => withEnv().patch({ count: 0 }, { layer: 'base' }))
    expect(error).toBeInstanceOf(ConfigValidationError)
    expect(error).toMatchObject({
      issues: [{ path: ['count'], message: expect.any(String) }],
    })
  })

  it('throws ConfigValidationError when the config is not an object', () => {
    const error = caught(() => withEnv().put(5, { force: true }))
    expect(error).toBeInstanceOf(ConfigValidationError)
    expect(error).toMatchObject({
      issues: [{ path: [], message: 'the config must be an object' }],
    })
  })

  it.each(['undo', 'redo'] as const)(
    'throws ConfigHistoryError on %s with nothing to do',
    (action) => {
      const error = caught(() => withEnv()[action]())
      expect(error).toBeInstanceOf(ConfigHistoryError)
      expect(error).toMatchObject({ action })
    }
  )

  it('passes on what a beforeUpdate listener throws as it is', () => {
    const config = withEnv()
    const thrown = new Error('disk full')
    config.on('beforeUpdate', () => {
      throw thrown
    })
    expect(caught(() => config.patch({ count: 2 }))).toBe(thrown)
  })
})
