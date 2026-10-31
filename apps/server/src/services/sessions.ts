import { type FSWatcher, watch } from 'node:fs'
import path from 'node:path'
import {
  deleteSession,
  forkSession,
  getSessionMessages,
  type Query,
  renameSession,
} from '@anthropic-ai/claude-agent-sdk'
import type { Provider, ProviderStatus } from '@offsite/core/providers'
import type { Session, SessionPatch } from '@offsite/core/sessions'
import { eq, sql } from 'drizzle-orm'
import {
  codexBaseDir,
  codexInstalled,
  deleteThread,
  forkThread,
  renameThread,
} from '../lib/codex/index.ts'
import { broadcast } from '../lib/hub.ts'
import { runs, titleJobs } from '../lib/live.ts'
import {
  forkOpenCode,
  openCodeInstalled,
  removeOpenCode,
  renameOpenCode,
} from '../lib/opencode/index.ts'
import { claudeBaseDir, readConfig } from '../storage/config.ts'
import { db } from '../storage/db.ts'
import { sessions as sessionsTable } from '../storage/schema.ts'
import { providerName } from './accounts.ts'
import { projectPath, projects } from './projects.ts'
import { find, type Found, info } from './provider-sessions.ts'

const day = 24 * 60 * 60 * 1000
const LIST_TIMEOUT = 10_000
const REFRESH_DELAY = 1000

const allProviders: Provider[] = ['claude', 'codex', 'opencode']

const listed: Record<Provider, Found[]> = {
  claude: [],
  codex: [],
  opencode: [],
}
const statuses: Record<Provider, ProviderStatus> = {
  claude: { provider: 'claude', state: 'loading', error: null },
  codex: { provider: 'codex', state: 'loading', error: null },
  opencode: { provider: 'opencode', state: 'loading', error: null },
}
const refreshing = new Map<Provider, { again: boolean }>()
const timers = new Map<Provider, NodeJS.Timeout>()
const providers = new Map<string, Provider>()
let watchers: FSWatcher[] = []

export function sessions(): Session[] {
  const known = new Set(projects().map((project) => project.id))
  return withStatus(
    allProviders
      .flatMap((provider) => listed[provider])
      .filter((item) => known.has(item.projectId))
  ).filter((session) => session.status !== 'inactive')
}

export async function inactiveSessions(projectId: string | null) {
  const found = await everything(
    projectPaths().filter(([, id]) => projectId === null || id === projectId)
  )
  return found
    .filter((session) => session.status === 'inactive')
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function searchSessions(query: string) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const folders = new Map(
    projects().map((project) => [project.id, project.path])
  )
  const found = await everything(projectPaths())
  return found
    .filter((session) => {
      const text =
        `${session.title} ${folders.get(session.projectId) ?? ''}`.toLowerCase()
      return words.every((word) => text.includes(word))
    })
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 50)
}

export async function findSession(id: string) {
  const paths = new Map(projectPaths())
  const owner = ownerOf(id)
  if (owner !== undefined) {
    const item = await info(owner, id, paths)
    return item === null ? null : withStatus([item])[0]
  }
  for (const provider of allProviders) {
    if (!readConfig().enabledProviders[provider]) {
      continue
    }
    const item = await info(provider, id, paths).catch(() => null)
    if (item !== null) {
      providers.set(id, provider)
      return withStatus([item])[0]
    }
  }
  return null
}

async function everything(paths: [string, string][]) {
  const found = (
    await Promise.all(
      allProviders
        .filter((provider) => readConfig().enabledProviders[provider])
        .map((provider) => find(provider, new Map(paths)))
    )
  ).flatMap((items) => items ?? [])
  for (const item of found) {
    providers.set(item.id, item.provider)
  }
  return withStatus(found)
}

function withStatus(items: Found[]): Session[] {
  const records = new Map(
    db
      .select()
      .from(sessionsTable)
      .all()
      .map((record) => [record.sessionId, record])
  )
  return items.map((item): Session => {
    const record = records.get(item.id)
    const updatedAt = record?.interactedAt ?? item.updatedAt
    return {
      ...item,
      updatedAt,
      status:
        record === undefined ||
        ((record.status === 'active' || record.status === 'snoozed') &&
          Date.now() - updatedAt > day)
          ? 'inactive'
          : record.status,
    }
  })
}

function projectPaths() {
  return projects().map((project): [string, string] => [
    project.path,
    project.id,
  ])
}

function ownerOf(sessionId: string) {
  return runs.get(sessionId)?.provider ?? providers.get(sessionId)
}

export function providerStatuses() {
  return allProviders.map((provider) => statuses[provider])
}

export function listedUpdatedAt(provider: Provider, sessionId: string) {
  return (
    listed[provider].find((item) => item.id === sessionId)?.updatedAt ?? null
  )
}

export function providerOf(sessionId: string) {
  const provider = ownerOf(sessionId)
  if (provider === undefined) {
    throw new Error('offsite does not know this session yet, reload the page')
  }
  return provider
}

export function recordInteraction(id: string) {
  db.insert(sessionsTable)
    .values({ sessionId: id, interactedAt: Date.now(), status: 'active' })
    .onConflictDoUpdate({
      target: sessionsTable.sessionId,
      set: {
        interactedAt: Date.now(),
        status: sql`CASE ${sessionsTable.status} WHEN 'pinned' THEN 'pinned' WHEN 'snoozed' THEN 'snoozed' WHEN 'minimized' THEN 'minimized' ELSE 'active' END`,
      },
    })
    .run()
}

export function publishSessions() {
  broadcast({ type: 'sessions', sessions: sessions() })
}

export function refreshAll() {
  for (const provider of allProviders) {
    void refresh(provider)
  }
}

export function refreshSessions(provider: Provider) {
  if (timers.has(provider)) {
    return
  }
  timers.set(
    provider,
    setTimeout(() => {
      timers.delete(provider)
      void refresh(provider)
    }, REFRESH_DELAY)
  )
}

export async function refresh(provider: Provider) {
  const current = refreshing.get(provider)
  if (current !== undefined) {
    current.again = true
    return
  }
  const entry = { again: true }
  refreshing.set(provider, entry)
  while (entry.again) {
    entry.again = false
    await list(provider)
  }
  refreshing.delete(provider)
}

async function list(provider: Provider) {
  const paths = new Map(projectPaths())
  const before = statuses[provider]
  let timer: NodeJS.Timeout | undefined
  try {
    if (!readConfig().enabledProviders[provider]) {
      listed[provider] = []
      statuses[provider] = { provider, state: 'disabled', error: null }
      return
    }
    const found = await Promise.race([
      tracked(provider, paths),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                `${providerName(provider)} did not list its sessions within ${LIST_TIMEOUT / 1000} seconds`
              )
            ),
          LIST_TIMEOUT
        )
      }),
    ])
    if (found === null) {
      listed[provider] = []
      statuses[provider] = { provider, state: 'missing', error: null }
    } else {
      listed[provider] = found
      statuses[provider] = { provider, state: 'ready', error: null }
      for (const item of found) {
        providers.set(item.id, provider)
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(
      `could not list ${providerName(provider)} sessions: ${message}`
    )
    statuses[provider] = { provider, state: 'error', error: message }
  } finally {
    clearTimeout(timer)
    publishSessions()
    if (JSON.stringify(statuses[provider]) !== JSON.stringify(before)) {
      broadcast({ type: 'providers', providers: providerStatuses() })
    }
  }
}

async function tracked(
  provider: Provider,
  paths: Map<string, string>
): Promise<Found[] | null> {
  if (
    (provider === 'codex' && !codexInstalled()) ||
    (provider === 'opencode' && !openCodeInstalled())
  ) {
    return null
  }
  const found = await Promise.all(
    db
      .select()
      .from(sessionsTable)
      .all()
      .map((record) => {
        const owner = ownerOf(record.sessionId)
        if (owner === provider) {
          return info(provider, record.sessionId, paths)
        }
        if (owner === undefined) {
          return info(provider, record.sessionId, paths).catch(() => null)
        }
        return null
      })
  )
  return found.filter((item) => item !== null)
}

export function watchSessions() {
  for (const watcher of watchers) {
    watcher.close()
  }
  watchers = (
    [
      ['claude', path.join(claudeBaseDir(), 'projects')],
      ['codex', path.join(codexBaseDir, 'sessions')],
    ] as const
  ).flatMap(([provider, dir]) => {
    if (!readConfig().enabledProviders[provider]) {
      return []
    }
    try {
      const watcher = watch(dir, { recursive: true }, () =>
        refreshSessions(provider)
      )
      watcher.on('error', (error) =>
        console.warn(`stopped watching ${dir}: ${error}`)
      )
      return [watcher]
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
      return []
    }
  })
}

export async function updateSession(id: string, patch: SessionPatch) {
  if (patch.title !== undefined) {
    titleJobs.delete(id)
    switch (providerOf(id)) {
      case 'claude': {
        const run = runs.get(id)
        if (run?.provider === 'claude') {
          await (
            run.query as Query & {
              renameSession(title: string, sessionId: string): Promise<void>
            }
          ).renameSession(patch.title, id)
        } else {
          await renameSession(id, patch.title)
        }
        break
      }
      case 'codex':
        await renameThread(id, patch.title)
        break
      case 'opencode':
        await renameOpenCode(id, patch.title)
    }
  }
  if (patch.status === 'inactive') {
    const run = runs.get(id)
    if (run !== undefined) {
      if (run.running) {
        await run.interrupt()
      }
      run.stop()
      await run.closed
    }
    db.delete(sessionsTable).where(eq(sessionsTable.sessionId, id)).run()
  } else if (patch.status !== undefined) {
    const set =
      patch.status === 'active' || patch.status === 'snoozed'
        ? { status: patch.status, interactedAt: Date.now() }
        : { status: patch.status }
    db.insert(sessionsTable)
      .values({ sessionId: id, ...set })
      .onConflictDoUpdate({
        target: sessionsTable.sessionId,
        set,
      })
      .run()
    await refresh(providerOf(id))
  }
  if (patch.title !== undefined) {
    refreshSessions(providerOf(id))
  }
}

export async function removeSession(id: string) {
  const provider = providerOf(id)
  const run = runs.get(id)
  if (run !== undefined) {
    run.stop()
    await run.closed
  }
  switch (provider) {
    case 'claude':
      await deleteSession(id)
      break
    case 'codex':
      await deleteThread(id)
      break
    case 'opencode':
      await removeOpenCode(id)
  }
  db.delete(sessionsTable).where(eq(sessionsTable.sessionId, id)).run()
  listed[provider] = listed[provider].filter((item) => item.id !== id)
}

export async function fork(
  sessionId: string,
  projectId: string,
  messageId: string
) {
  const provider = providerOf(sessionId)
  const result = await forkWith(
    provider,
    sessionId,
    projectPath(projectId),
    messageId
  )
  providers.set(result.sessionId, provider)
  recordInteraction(result.sessionId)
  refreshSessions(provider)
  return result
}

async function forkWith(
  provider: Provider,
  sessionId: string,
  cwd: string,
  messageId: string
) {
  if (provider === 'codex') {
    return forkThread(sessionId, messageId)
  }
  if (provider === 'opencode') {
    return forkOpenCode(sessionId, messageId)
  }
  const disk = await getSessionMessages(sessionId, { dir: cwd })
  const index = disk.findIndex((item) => item.uuid === messageId)
  if (index < 0) {
    throw new Error('Cannot fork the session at that point')
  }
  const result = await forkSession(sessionId, {
    dir: cwd,
    upToMessageId: messageId,
  })
  return { sessionId: result.sessionId }
}
