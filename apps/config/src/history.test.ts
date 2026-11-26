import { describe, expect, it } from 'vitest'
import { record, redone, undone } from './history.ts'
import type { StateHistoryEntry } from './types.ts'

function entry(at: number): StateHistoryEntry<undefined> {
  return {
    method: 'patch',
    options: {},
    meta: undefined,
    changed: [],
    at,
    before: [],
    after: [],
  }
}

describe('record', () => {
  it('adds the entry to past and clears future', () => {
    expect(
      record({ past: [entry(1)], future: [entry(2)] }, entry(3), 10)
    ).toEqual({ past: [entry(1), entry(3)], future: [] })
  })

  it('drops the oldest entries past the limit', () => {
    expect(
      record({ past: [entry(1), entry(2)], future: [] }, entry(3), 2)
    ).toEqual({ past: [entry(2), entry(3)], future: [] })
  })

  it('keeps nothing with a limit of 0', () => {
    expect(record({ past: [], future: [entry(2)] }, entry(1), 0)).toEqual({
      past: [],
      future: [],
    })
  })
})

describe('undone', () => {
  it('moves the last past entry to the front of future', () => {
    expect(
      undone({ past: [entry(1), entry(2)], future: [entry(3)] }, entry(2))
    ).toEqual({ past: [entry(1)], future: [entry(2), entry(3)] })
  })
})

describe('redone', () => {
  it('moves the first future entry to the end of past', () => {
    expect(
      redone({ past: [entry(1)], future: [entry(2), entry(3)] }, entry(2))
    ).toEqual({ past: [entry(1), entry(2)], future: [entry(3)] })
  })
})
