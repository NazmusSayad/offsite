export function githubCache<T>(ttl: number, limit: number) {
  const entries = new Map<string, { at: number; value: Promise<T> }>()
  return {
    get(key: string, fresh: boolean, load: () => Promise<T>) {
      const entry = entries.get(key)
      if (!fresh && entry !== undefined && Date.now() - entry.at < ttl) {
        return entry.value
      }
      const value = load()
      entries.delete(key)
      entries.set(key, { at: Date.now(), value })
      const oldest = entries.keys().next()
      if (entries.size > limit && oldest.done === false) {
        entries.delete(oldest.value)
      }
      value.then(
        () => undefined,
        () => {
          if (entries.get(key)?.value === value) {
            entries.delete(key)
          }
        }
      )
      return value
    },
    clear() {
      entries.clear()
    },
  }
}
