import path from 'node:path'
import type { Provider } from '@offsite/core/providers'
import { broadcast } from '../lib/hub.ts'
import { logger } from '../lib/log.ts'
import { readConfig } from '../storage/config.ts'
import { providerName } from './accounts.ts'
import { projects } from './projects.ts'
import { find, type Found, info, timeLimit } from './provider-sessions.ts'

const log = logger.withTag('threads')

const allProviders: Provider[] = ['claude', 'codex', 'opencode']

const threads: Record<Provider, Map<string, Found>> = {
  claude: new Map(),
  codex: new Map(),
  opencode: new Map(),
}
const changed: Record<Provider, Set<string>> = {
  claude: new Set(),
  codex: new Set(),
  opencode: new Set(),
}
const failures = new Set<Provider>()
let built = Promise.resolve()
let builtFor = ''

export function rebuildThreads() {
  const config = readConfig()
  const key = JSON.stringify([
    projectPaths(),
    config.enabledProviders,
    config.claudeBaseDir,
  ])
  if (key === builtFor) {
    return
  }
  builtFor = key
  built = relistAll()
}

export function threadsReady() {
  return built
}

export function threadFailed(provider: Provider) {
  return failures.has(provider)
}

export function knownThreads() {
  const known = new Set(projects().map((project) => project.id))
  return allProviders
    .filter((provider) => readConfig().enabledProviders[provider])
    .flatMap((provider) => [...threads[provider].values()])
    .filter((item) => known.has(item.projectId))
}

export async function providerThreads(provider: Provider) {
  await built
  if (failures.has(provider)) {
    throw new Error(`could not list ${providerName(provider)} sessions`)
  }
  return knownThreads().filter((item) => item.provider === provider)
}

export function threadOf(provider: Provider, id: string) {
  return threads[provider].get(id)
}

export function threadProvider(id: string) {
  return allProviders.find((provider) => threads[provider].has(id))
}

export function markChanged(provider: Provider, id: string) {
  changed[provider].add(id)
}

export function fileChanged(
  provider: 'claude' | 'codex',
  filename: string | null
) {
  if (filename === null) {
    return
  }
  if (provider === 'claude') {
    const parts = filename.split(path.sep)
    if (parts.length === 2 && parts[1].endsWith('.jsonl')) {
      changed.claude.add(path.basename(parts[1], '.jsonl'))
    }
    return
  }
  const id =
    /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/.exec(
      filename
    )?.[1]
  if (id !== undefined) {
    changed.codex.add(id)
  }
}

export function forgetThread(provider: Provider, id: string) {
  threads[provider].delete(id)
  broadcast({ type: 'threads' })
}

export async function updateThreads(provider: Provider) {
  if (provider === 'opencode') {
    await relist(provider)
    return
  }
  const ids = [...changed[provider]]
  changed[provider].clear()
  if (ids.length === 0) {
    return
  }
  await built
  const paths = new Map(projectPaths())
  const results = await Promise.all(
    ids.map(async (id) => {
      try {
        return {
          id,
          item: await timeLimit(
            lookup(provider, id, paths),
            `${providerName(provider)} did not find session ${id} in time`
          ),
        }
      } catch (error) {
        log.warn(`could not update ${providerName(provider)} session:`, error)
        return null
      }
    })
  )
  let updated = false
  for (const result of results) {
    if (result === null) {
      continue
    }
    const before = threads[provider].get(result.id)
    if (result.item === null) {
      updated ||= before !== undefined
      threads[provider].delete(result.id)
      continue
    }
    updated ||= JSON.stringify(before) !== JSON.stringify(result.item)
    threads[provider].set(result.id, result.item)
  }
  if (updated) {
    broadcast({ type: 'threads' })
  }
}

async function lookup(
  provider: Provider,
  id: string,
  paths: Map<string, string>
) {
  const known = threads[provider].get(id)
  const knownPath =
    known === undefined
      ? undefined
      : [...paths].find((entry) => entry[1] === known.projectId)
  if (knownPath === undefined) {
    return info(provider, id, paths)
  }
  return (
    (await info(provider, id, new Map([knownPath]))) ??
    info(provider, id, paths)
  )
}

async function relistAll() {
  await Promise.all(allProviders.map((provider) => relist(provider)))
}

async function relist(provider: Provider) {
  if (!readConfig().enabledProviders[provider]) {
    threads[provider] = new Map()
    failures.delete(provider)
    broadcast({ type: 'threads' })
    return
  }
  try {
    const found =
      (await timeLimit(
        find(provider, new Map(projectPaths())),
        `${providerName(provider)} did not list its sessions in time`
      )) ?? []
    threads[provider] = new Map(found.map((item) => [item.id, item]))
    failures.delete(provider)
  } catch (error) {
    log.warn(`could not list all ${providerName(provider)} sessions:`, error)
    failures.add(provider)
    builtFor = ''
  }
  broadcast({ type: 'threads' })
}

function projectPaths() {
  return projects().map((project): [string, string] => [
    project.path,
    project.id,
  ])
}
