import { type FSWatcher, watch } from 'node:fs'
import path from 'node:path'
import {
  deleteSession,
  forkSession,
  getSessionMessages,
  type Query,
  renameSession,
} from '@anthropic-ai/claude-agent-sdk'
import { NO_PROJECT } from '@offsite/core/projects'
import type { Provider, ProviderStatus } from '@offsite/core/providers'
import { nextOpens } from '@offsite/core/search'
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
import { logger } from '../lib/log.ts'
import {
  forkOpenCode,
  openCodeInstalled,
  removeOpenCode,
  renameOpenCode,
} from '../lib/opencode/index.ts'
import { claudeBaseDir, readConfig } from '../storage/config.ts'
import { db } from '../storage/db.ts'
import {
  sessionOpens as sessionOpensTable,
  sessionPlaces,
  sessions as sessionsTable,
} from '../storage/schema.ts'
import { providerName } from './accounts.ts'
import { clearSessionOutbox } from './outbox.ts'
import { projectPath, projects } from './projects.ts'
import { type Found, info, timeLimit } from './provider-sessions.ts'
import { forgetStarting, startingSessions } from './starting-sessions.ts'
import {
  fileChanged,
  forgetThread,
  knownThreads,
  markChanged,
  rebuildThreads,
  threadFailed,
  threadOf,
  threadProvider,
  threadsReady,
  updateThreads,
} from './threads.ts'

const log = logger.withTag('sessions')

const day = 24 * 60 * 60 * 1000
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
let publishedSessions = ''

export function sessions(): Session[] {
  const known = new Set(projects().map((project) => project.id))
  const found = allProviders.flatMap((provider) => listed[provider])
  return withStatus(
    [...found, ...startingSessions(found)].filter((item) =>
      known.has(item.projectId)
    )
  ).filter((session) => session.status !== 'inactive')
}

export async function inactiveSessions(params: {
  projectId: string | null
  limit: number
}) {
  await threadsReady()
  const scope = new Set(
    projects()
      .filter(
        (project) =>
          params.projectId === null ||
          project.id === params.projectId ||
          project.parentId === params.projectId ||
          (params.projectId === NO_PROJECT && project.scratch)
      )
      .map((project) => project.id)
  )
  const found = withStatus(
    knownThreads().filter((item) => scope.has(item.projectId))
  )
    .filter((session) => session.status === 'inactive')
    .sort((a, b) => b.updatedAt - a.updatedAt)
  return { sessions: found.slice(0, params.limit), total: found.length }
}

export async function searchableSessions() {
  await threadsReady()
  const found = knownThreads()
  const opens = new Map(
    db
      .select()
      .from(sessionOpensTable)
      .all()
      .map((record) => [record.sessionId, record])
  )
  return {
    sessions: withStatus(found).map((session) => ({
      ...session,
      opens: opens.get(session.id) ?? null,
    })),
    failed: enabledProviders().filter((provider) => threadFailed(provider)),
  }
}

export async function findSession(id: string) {
  if (ownerOf(id) === undefined) {
    await threadsReady()
  }
  const owner = ownerOf(id)
  if (owner === undefined) {
    return null
  }
  const item = await info(owner, id, new Map(projectPaths()))
  return item === null ? null : withStatus([item])[0]
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

export function enabledProviders() {
  return allProviders.filter((provider) => readConfig()[provider].enabled)
}

function projectPaths() {
  return projects().map((project): [string, string] => [
    project.path,
    project.id,
  ])
}

function ownerOf(sessionId: string) {
  return (
    runs.get(sessionId)?.provider ??
    db
      .select({ provider: sessionsTable.provider })
      .from(sessionsTable)
      .where(eq(sessionsTable.sessionId, sessionId))
      .get()?.provider ??
    providers.get(sessionId) ??
    threadProvider(sessionId)
  )
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

export function recordInteraction(
  id: string,
  provider: Provider,
  status: 'active' | 'snoozed' | null
) {
  db.insert(sessionsTable)
    .values({
      sessionId: id,
      provider,
      interactedAt: Date.now(),
      status: status ?? 'active',
    })
    .onConflictDoUpdate({
      target: sessionsTable.sessionId,
      set: {
        provider,
        interactedAt: Date.now(),
        status:
          status === null
            ? sql`CASE ${sessionsTable.status} WHEN 'pinned' THEN 'pinned' WHEN 'snoozed' THEN 'snoozed' WHEN 'minimized' THEN 'minimized' ELSE 'active' END`
            : sql`CASE ${sessionsTable.status} WHEN 'pinned' THEN 'pinned' ELSE ${status} END`,
      },
    })
    .run()
}

export function recordOpen(id: string, query: string | null) {
  const previous = db
    .select()
    .from(sessionOpensTable)
    .where(eq(sessionOpensTable.sessionId, id))
    .get()
  const opens = nextOpens(previous ?? null, Date.now(), query)
  db.insert(sessionOpensTable)
    .values({ sessionId: id, ...opens })
    .onConflictDoUpdate({ target: sessionOpensTable.sessionId, set: opens })
    .run()
}

export function publishSessions() {
  const list = sessions()
  const json = JSON.stringify(list)
  if (json === publishedSessions) {
    return
  }
  publishedSessions = json
  broadcast({ type: 'sessions', sessions: list })
}

export function refreshAll() {
  rebuildThreads()
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
      void updateThreads(provider)
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
  try {
    if (!readConfig()[provider].enabled) {
      listed[provider] = []
      statuses[provider] = { provider, state: 'disabled', error: null }
      return
    }
    const found = await timeLimit(
      tracked(provider, paths),
      `${providerName(provider)} did not list its sessions in time`
    )
    if (found === null) {
      listed[provider] = []
      statuses[provider] = { provider, state: 'missing', error: null }
    } else {
      listed[provider] = found
      statuses[provider] = { provider, state: 'ready', error: null }
      for (const item of found) {
        providers.set(item.id, provider)
        forgetStarting(item.id)
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log.warn(`could not list ${providerName(provider)} sessions: ${message}`)
    statuses[provider] = { provider, state: 'error', error: message }
  } finally {
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
      .filter((record) => record.provider === provider)
      .map((record) => lookup(provider, record.sessionId, paths))
  )
  return found.filter((item) => item !== null)
}

async function lookup(
  provider: Provider,
  sessionId: string,
  paths: Map<string, string>
) {
  const known =
    threadOf(provider, sessionId) ??
    listed[provider].find((item) => item.id === sessionId)
  const knownPath =
    known === undefined
      ? undefined
      : [...paths].find((entry) => entry[1] === known.projectId)
  if (knownPath === undefined) {
    return info(provider, sessionId, paths)
  }
  return (
    (await info(provider, sessionId, new Map([knownPath]))) ??
    info(provider, sessionId, paths)
  )
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
    if (!readConfig()[provider].enabled) {
      return []
    }
    try {
      const watcher = watch(dir, { recursive: true }, (_, filename) => {
        fileChanged(provider, filename)
        refreshSessions(provider)
      })
      watcher.on('error', (error) =>
        log.warn(`stopped watching ${dir}:`, error)
      )
      log.debug(`watching ${dir}`)
      return [watcher]
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
      log.debug(`not watching ${dir}, it does not exist`)
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
    const provider = providerOf(id)
    db.insert(sessionsTable)
      .values({ sessionId: id, provider, ...set })
      .onConflictDoUpdate({
        target: sessionsTable.sessionId,
        set: { provider, ...set },
      })
      .run()
    await refresh(provider)
  }
  if (patch.title !== undefined) {
    markChanged(providerOf(id), id)
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
  db.delete(sessionOpensTable).where(eq(sessionOpensTable.sessionId, id)).run()
  db.delete(sessionPlaces).where(eq(sessionPlaces.sessionId, id)).run()
  clearSessionOutbox(id)
  listed[provider] = listed[provider].filter((item) => item.id !== id)
  forgetThread(provider, id)
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
  recordInteraction(result.sessionId, provider, null)
  markChanged(provider, result.sessionId)
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
