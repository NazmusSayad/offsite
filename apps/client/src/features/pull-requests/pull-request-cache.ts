import type {
  PullRequestDetails,
  PullRequestList,
  PullRequestSummary,
} from '@offsite/core/pull-requests'
import { type FileDiffMetadata, parsePatchFiles } from '@pierre/diffs'
import { useSyncExternalStore } from 'react'
import { call } from '@/api/connection'
import { logger } from '@/lib/log'

type Place = { machine: string; projectId: string; worktreeId: string | null }

const log = logger.withTag('pull-requests')
let order = 0

export const listCache = memoryCache<PullRequestList>(50)
export const detailsCache = memoryCache<PullRequestDetails>(50)
const diffs = memoryCache<FileDiffMetadata[]>(10)
export const summaries = new Map<string, PullRequestSummary>()

export function useCacheVersion<T>(cache: ReturnType<typeof memoryCache<T>>) {
  return useSyncExternalStore(cache.subscribe, cache.version)
}

export function useCached<T>(
  cache: ReturnType<typeof memoryCache<T>>,
  key: string
) {
  return useSyncExternalStore(cache.subscribe, () => cache.get(key))
}

export function detailsKey(place: Place, url: string) {
  return JSON.stringify([place.machine, place.projectId, place.worktreeId, url])
}

export function loadDetails(place: Place, url: string, fresh: boolean) {
  return detailsCache.load(detailsKey(place, url), fresh, () =>
    call(place.machine, 'pulls.view', {
      projectId: place.projectId,
      worktreeId: place.worktreeId,
      url,
      fresh,
    })
  )
}

export function diffKey(machine: string, url: string, head: string) {
  return JSON.stringify([machine, url, head])
}

export function useDiff(machine: string, url: string, head: string) {
  return useCached(diffs, diffKey(machine, url, head))
}

export async function loadDiff(machine: string, url: string, head: string) {
  const key = diffKey(machine, url, head)
  const loaded = diffs.get(key)
  if (loaded !== undefined) {
    return loaded
  }
  return diffs.load(key, false, async () => {
    const patch = await call(machine, 'pulls.diff', { url, head })
    return patch.trim() === ''
      ? []
      : parsePatchFiles(patch, {
          cacheKeyPrefix: `pull ${url} ${head}`,
        }).flatMap((item) => item.files)
  })
}

export function prefetch(load: () => Promise<unknown>) {
  load().catch((error: unknown) => log.warn('prefetch failed', error))
}

function memoryCache<T>(limit: number) {
  const values = new Map<string, { value: T; order: number }>()
  const loads = new Map<string, Promise<T>>()
  const listeners = new Set<() => void>()
  let version = 0

  async function load(key: string, fresh: boolean, fetch: () => Promise<T>) {
    const running = loads.get(key)
    if (!fresh && running !== undefined) {
      return running
    }
    order += 1
    const started = order
    const promise = fetch()
    loads.set(key, promise)
    try {
      const value = await promise
      const entry = values.get(key)
      if (entry === undefined || entry.order < started) {
        values.delete(key)
        values.set(key, { value, order: started })
        const oldest = values.keys().next()
        if (values.size > limit && oldest.done === false) {
          values.delete(oldest.value)
        }
        version += 1
        for (const listener of listeners) {
          listener()
        }
      }
      return value
    } finally {
      if (loads.get(key) === promise) {
        loads.delete(key)
      }
    }
  }

  return {
    get(key: string) {
      return values.get(key)?.value
    },
    load,
    version() {
      return version
    },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
