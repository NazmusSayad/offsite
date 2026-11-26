import { isEqual, isPlainObject, mergeWith } from 'es-toolkit'
import type { UpdateValueChange } from './types.ts'

export function merge(base: unknown, over: unknown): unknown {
  if (!isPlainObject(base) || !isPlainObject(over)) {
    return structuredClone(over)
  }
  return mergeWith(
    structuredClone(base),
    structuredClone(over),
    (baseValue: unknown, overValue: unknown) =>
      isPlainObject(baseValue) && isPlainObject(overValue)
        ? undefined
        : overValue
  )
}

export function discard(
  value: unknown,
  target: PropertyKey[]
): PropertyKey[] | null {
  const key = target.at(0)
  if (
    key === undefined ||
    typeof value !== 'object' ||
    value === null ||
    !Object.hasOwn(value, key)
  ) {
    return null
  }
  const inner =
    target.length > 1 ? discard(Reflect.get(value, key), target.slice(1)) : null
  if (inner !== null) {
    return [key, ...inner]
  }
  if (Array.isArray(value)) {
    value.splice(Number(key), 1)
  } else {
    Reflect.deleteProperty(value, key)
  }
  return [key]
}

export function diff(
  before: unknown,
  after: unknown,
  path: string[]
): UpdateValueChange[] {
  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)])
    return [...keys].flatMap((key) =>
      diff(before[key], after[key], [...path, key])
    )
  }
  return isEqual(before, after) ? [] : [{ path, before, after }]
}
