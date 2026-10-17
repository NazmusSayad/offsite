import { type FSWatcher, watch } from 'node:fs'
import path from 'node:path'
import {
  deleteSession,
  forkSession,
  getSessionMessages,
  listSessions,
  renameSession,
} from '@anthropic-ai/claude-agent-sdk'
import type {
  Provider,
  ProviderStatus,
  Session,
  SessionPatch,
} from '@offsite/core/protocol'
import { eq, sql } from 'drizzle-orm'
import {
  codexBaseDir,
  codexInstalled,
  codexThreads,
  deleteThread,
  forkThread,
  renameThread,
} from '../lib/codex/index.ts'
import { broadcast } from '../lib/hub.ts'
import { runs } from '../lib/live.ts'
import {
  forkOpenCode,
  openCodeInstalled,
  openCodeSessions,
  removeOpenCode,
  renameOpenCode,
} from '../lib/opencode/index.ts'
import { claudeBaseDir, readConfig } from '../storage/config.ts'
import { db } from '../storage/db.ts'
import { sessions as sessionsTable } from '../storage/schema.ts'
import { providerName } from './accounts.ts'
import { projectPath, projects } from './projects.ts'

const day = 24 * 60 * 60 * 1000
const LIST_TIMEOUT = 10_000
const REFRESH_DELAY = 1000

type Found = Omit<Session, 'status'>

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
  const records = new Map(
    db
      .select()
      .from(sessionsTable)
      .all()
      .map((record) => [record.sessionId, record])
  )
  const known = new Set(projects().map((project) => project.id))
  return allProviders.flatMap((provider) =>
    listed[provider]
      .filter((item) => known.has(item.projectId))
      .map((item): Session => {
        const record = records.get(item.id)
        const updatedAt = record?.interactedAt ?? item.updatedAt
        return {
          ...item,
          updatedAt,
          status:
            record === undefined ||
            (record.status === 'active' && Date.now() - updatedAt > day)
              ? 'inactive'
              : record.status,
        }
      })
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
  const provider = runs.get(sessionId)?.provider ?? providers.get(sessionId)
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
        status: sql`CASE ${sessionsTable.status} WHEN 'pinned' THEN 'pinned' WHEN 'minimized' THEN 'minimized' ELSE 'active' END`,
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

async function refresh(provider: Provider) {
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
  const paths = new Map(projects().map((project) => [project.path, project.id]))
  const before = statuses[provider]
  let timer: NodeJS.Timeout | undefined
  try {
    if (!readConfig().enabledProviders[provider]) {
      listed[provider] = []
      statuses[provider] = { provider, state: 'disabled', error: null }
      return
    }
    const found = await Promise.race([
      find(provider, paths),
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

async function find(
  provider: Provider,
  paths: Map<string, string>
): Promise<Found[] | null> {
  switch (provider) {
    case 'claude':
      return (
        await Promise.all(
          [...paths].map(async ([cwd, projectId]) =>
            (
              await listSessions({
                dir: cwd,
                includeWorktrees: false,
                includeProgrammatic: false,
              })
            ).map((item) => ({
              id: item.sessionId,
              provider: 'claude' as const,
              title: item.summary,
              projectId,
              branch: item.gitBranch ?? null,
              updatedAt: item.lastModified,
            }))
          )
        )
      ).flat()
    case 'codex':
      if (!codexInstalled()) {
        return null
      }
      return (await codexThreads([...paths.keys()])).flatMap((thread) => {
        const projectId = paths.get(thread.cwd)
        if (projectId === undefined) {
          return []
        }
        return [
          {
            id: thread.id,
            provider: 'codex' as const,
            title: thread.name ?? thread.preview,
            projectId,
            branch: thread.gitInfo?.branch ?? null,
            updatedAt: thread.updatedAt * 1000,
          },
        ]
      })
    case 'opencode':
      if (!openCodeInstalled()) {
        return null
      }
      return (await openCodeSessions([...paths.keys()])).flatMap((session) => {
        const projectId = paths.get(session.location.directory)
        if (projectId === undefined) {
          return []
        }
        return [
          {
            id: session.id,
            provider: 'opencode' as const,
            title: session.title ?? 'New session',
            projectId,
            branch: null,
            updatedAt: session.time.updated,
          },
        ]
      })
  }
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
    switch (providerOf(id)) {
      case 'claude':
        await renameSession(id, patch.title)
        break
      case 'codex':
        await renameThread(id, patch.title)
        break
      case 'opencode':
        await renameOpenCode(id, patch.title)
    }
  }
  if (patch.status === 'inactive') {
    db.delete(sessionsTable).where(eq(sessionsTable.sessionId, id)).run()
  } else if (patch.status !== undefined) {
    const set =
      patch.status === 'active'
        ? { status: patch.status, interactedAt: Date.now() }
        : { status: patch.status }
    db.insert(sessionsTable)
      .values({ sessionId: id, ...set })
      .onConflictDoUpdate({
        target: sessionsTable.sessionId,
        set,
      })
      .run()
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
