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
  codexThread,
  codexThreads,
} from '../lib/codex/index.ts'
import type { Thread } from '../lib/codex/types.ts'
import {
  openCodeInstalled,
  openCodeSession,
  openCodeSessions,
} from '../lib/opencode/index.ts'

export type Found = Omit<Session, 'status'>

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
  paths: Map<string, string>
): Promise<Found | null> {
  switch (provider) {
    case 'claude': {
      const found = await Promise.all(
        [...paths].map(async ([cwd, projectId]) => {
          const item = await getSessionInfo(id, { dir: cwd })
          return item === undefined ? null : fromClaude(item, projectId)
        })
      )
      return found.find((item) => item !== null) ?? null
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
      const projectId = paths.get(thread.cwd)
      return projectId === undefined ? null : fromCodex(thread, projectId)
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
      const projectId = paths.get(session.location.directory)
      return projectId === undefined ? null : fromOpenCode(session, projectId)
    }
  }
}

function fromClaude(item: SDKSessionInfo, projectId: string): Found {
  return {
    id: item.sessionId,
    provider: 'claude',
    title: item.summary,
    projectId,
    branch: item.gitBranch ?? null,
    updatedAt: item.lastModified,
  }
}

function fromCodex(thread: Thread, projectId: string): Found {
  return {
    id: thread.id,
    provider: 'codex',
    title:
      thread.name ??
      thread.preview.replaceAll(/\[Image: source: [^\]]+\]/g, ''),
    projectId,
    branch: thread.gitInfo?.branch ?? null,
    updatedAt: thread.updatedAt * 1000,
  }
}

function fromOpenCode(session: SessionInfo, projectId: string): Found {
  return {
    id: session.id,
    provider: 'opencode',
    title: session.title ?? 'New session',
    projectId,
    branch: null,
    updatedAt: session.time.updated,
  }
}

export async function find(
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
            ).map((item) => fromClaude(item, projectId))
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
        return [fromCodex(thread, projectId)]
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
        return [fromOpenCode(session, projectId)]
      })
  }
}
