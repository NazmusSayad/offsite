import {
  getSessionInfo,
  listSessions,
  type SDKSessionInfo,
} from '@anthropic-ai/claude-agent-sdk'
import type { Provider } from '@offsite/core/providers'
import type { Session } from '@offsite/core/sessions'
import { isSessionNotFoundError, type SessionInfo } from '@opencode/client'
import {
  codexInstalled,
  codexMessages,
  codexThread,
  codexThreads,
} from '../lib/codex/index.ts'
import type { Thread } from '../lib/codex/types.ts'
import {
  openCodeInstalled,
  openCodeSession,
  openCodeSessions,
} from '../lib/opencode/index.ts'
import { db } from '../storage/db.ts'
import { sessionPlaces } from '../storage/schema.ts'
import type { Place } from './project-worktrees.ts'
import { projects } from './projects.ts'

export type Found = Omit<Session, 'status'>

type ProviderSession = Omit<Found, 'claudeWorktree'>

const TIME_LIMIT = 10_000

export function timeLimit<T>(work: Promise<T>, message: string) {
  let timer: NodeJS.Timeout | undefined
  return Promise.race([
    work,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), TIME_LIMIT)
    }),
  ]).finally(() => clearTimeout(timer))
}

export async function info(
  provider: Provider,
  id: string,
  paths: Map<string, Place>
): Promise<Found | null> {
  const found = await locate(provider, id, paths)
  return found === null ? null : placed([found])[0]
}

async function locate(
  provider: Provider,
  id: string,
  paths: Map<string, Place>
): Promise<ProviderSession | null> {
  switch (provider) {
    case 'claude': {
      if (paths.size > 1) {
        const item = await getSessionInfo(id)
        const place = item?.cwd === undefined ? undefined : paths.get(item.cwd)
        if (item !== undefined && place !== undefined) {
          return fromClaude(item, place)
        }
      }
      const found = (
        await Promise.all(
          [...paths].map(async ([cwd, place]) => {
            const item = await getSessionInfo(id, { dir: cwd })
            return item === undefined
              ? null
              : { exact: item.cwd === cwd, item: fromClaude(item, place) }
          })
        )
      ).filter((entry) => entry !== null)
      return (found.find((entry) => entry.exact) ?? found.at(0))?.item ?? null
    }
    case 'codex': {
      if (!codexInstalled()) {
        return null
      }
      const thread = await codexThread(id).catch((error: unknown) => {
        if (
          error instanceof Error &&
          error.message.startsWith('thread not loaded')
        ) {
          return null
        }
        throw error
      })
      if (thread === null) {
        return null
      }
      const place = paths.get(thread.cwd)
      return place === undefined ? null : fromCodex(thread, place)
    }
    case 'opencode': {
      if (!openCodeInstalled()) {
        return null
      }
      const session = await openCodeSession(id).catch((error: unknown) => {
        if (isSessionNotFoundError(error)) {
          return null
        }
        throw error
      })
      if (session === null) {
        return null
      }
      const place = paths.get(session.location.directory)
      return place === undefined ? null : fromOpenCode(session, place)
    }
  }
}

function fromClaude(item: SDKSessionInfo, place: Place): ProviderSession {
  return {
    id: item.sessionId,
    provider: 'claude',
    title: item.summary,
    projectId: place.projectId,
    worktreeId: place.worktreeId,
    branch:
      item.gitBranch === undefined || item.gitBranch === 'HEAD'
        ? null
        : item.gitBranch,
    updatedAt: item.lastModified,
  }
}

async function fromCodex(
  thread: Thread,
  place: Place
): Promise<ProviderSession> {
  let title =
    thread.name?.trim() ||
    thread.preview.replaceAll(/\[Image: source: [^\]]+\]/g, '').trim()
  if (title === '') {
    const messages = await codexMessages(thread.id).catch(() => [])
    title =
      messages
        .find(
          (message) => message.author === 'user' && message.text.trim() !== ''
        )
        ?.text.trim() ?? 'New thread'
  }
  return {
    id: thread.id,
    provider: 'codex',
    title,
    projectId: place.projectId,
    worktreeId: place.worktreeId,
    branch: thread.gitInfo?.branch ?? null,
    updatedAt: thread.updatedAt * 1000,
  }
}

function fromOpenCode(session: SessionInfo, place: Place): ProviderSession {
  return {
    id: session.id,
    provider: 'opencode',
    title: session.title ?? 'New session',
    projectId: place.projectId,
    worktreeId: place.worktreeId,
    branch: null,
    updatedAt: session.time.updated,
  }
}

export async function find(
  provider: Provider,
  paths: Map<string, Place>
): Promise<Found[] | null> {
  const found = await list(provider, paths)
  return found === null ? null : placed(found)
}

function placed(items: ProviderSession[]) {
  const records = new Map(
    db
      .select()
      .from(sessionPlaces)
      .all()
      .map((record) => [record.sessionId, record])
  )
  const known = new Set(projects().map((project) => project.id))
  return items.map((item) => {
    const record = records.get(item.id)
    if (record === undefined) {
      return { ...item, claudeWorktree: false }
    }
    if (!known.has(record.projectId)) {
      return { ...item, claudeWorktree: record.claudeWorktree }
    }
    return {
      ...item,
      projectId: record.projectId,
      worktreeId: record.worktreeId,
      claudeWorktree: record.claudeWorktree,
    }
  })
}

async function list(
  provider: Provider,
  paths: Map<string, Place>
): Promise<ProviderSession[] | null> {
  switch (provider) {
    case 'claude':
      return (
        await Promise.all(
          [...paths].map(async ([cwd, place]) =>
            (
              await listSessions({
                dir: cwd,
                includeWorktrees: false,
                includeProgrammatic: false,
              })
            ).map((item) => fromClaude(item, place))
          )
        )
      ).flat()
    case 'codex':
      if (!codexInstalled()) {
        return null
      }
      return (
        await Promise.all(
          (await codexThreads([...paths.keys()])).map(async (thread) => {
            const place = paths.get(thread.cwd)
            if (place === undefined) {
              return null
            }
            return fromCodex(thread, place)
          })
        )
      ).filter((item) => item !== null)
    case 'opencode':
      if (!openCodeInstalled()) {
        return null
      }
      return (await openCodeSessions([...paths.keys()])).flatMap((session) => {
        const place = paths.get(session.location.directory)
        if (place === undefined) {
          return []
        }
        return [fromOpenCode(session, place)]
      })
  }
}
