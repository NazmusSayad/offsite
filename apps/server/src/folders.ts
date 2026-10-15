import { broadcast } from './hub.ts'
import { readJson, writeJson } from './storage.ts'

export function folders() {
  return (readJson('folders.json') as string[] | null) ?? []
}

export function saveFolders(next: unknown) {
  if (!Array.isArray(next) || !next.every((item) => typeof item === 'string'))
    throw new Error('folders must be a list of paths')
  writeJson('folders.json', next)
  broadcast({ type: 'folders', folders: next })
  return next
}
