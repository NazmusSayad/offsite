export function keyedLock() {
  const locks = new Map<string, Promise<void>>()
  return async function locked<T>(key: string, task: () => Promise<T>) {
    const previous = locks.get(key) ?? Promise.resolve()
    const result = previous.then(task)
    const done = result.then(
      () => undefined,
      () => undefined
    )
    locks.set(key, done)
    await done
    if (locks.get(key) === done) {
      locks.delete(key)
    }
    return result
  }
}
