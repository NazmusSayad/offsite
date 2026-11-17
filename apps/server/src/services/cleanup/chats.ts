import { lstat, rm } from 'node:fs/promises'
import path from 'node:path'
import type { CleanupItem } from '@offsite/core/cleanup'
import { eq } from 'drizzle-orm'
import { logger } from '../../lib/log.ts'
import { db } from '../../storage/db.ts'
import { sessionPlaces } from '../../storage/schema.ts'
import { projects, removeProject, scratchRoot } from '../projects.ts'
import {
  enabledProviders,
  publishSessions,
  refreshAll,
  removeSession,
} from '../sessions.ts'
import { knownThreads, threadFailed, threadsReady } from '../threads.ts'
import { entries, folderStats, realPath } from './folders.ts'
import { busyReason } from './usage.ts'

const CHAT_AGE = 30 * 86_400_000
const log = logger.withTag('cleanup')

export type ChatItem = Extract<CleanupItem, { kind: 'chat' }>

export async function chatItems(now: number, ids: string[] | null) {
  await threadsReady()
  if (enabledProviders().some((provider) => threadFailed(provider))) {
    return []
  }
  const found: ChatItem[] = []
  for (const name of await entries(scratchRoot)) {
    const folder = path.join(scratchRoot, name)
    if (ids !== null && !ids.includes(`chat:${folder}`)) {
      continue
    }
    try {
      const item = await chatItem(folder, now)
      if (item !== null) {
        found.push(item)
      }
    } catch (error) {
      log.warn(`could not check the chat folder ${folder}:`, error)
    }
  }
  return found
}

async function chatItem(folder: string, now: number): Promise<ChatItem | null> {
  if (!(await lstat(folder)).isDirectory()) {
    return null
  }
  const real = realPath(folder)
  const project = projects().find((item) => realPath(item.path) === real)
  if (project !== undefined && !project.scratch) {
    return null
  }
  if (
    busyReason(real, { projectId: project?.id ?? null, worktreeIds: [] }) !==
    null
  ) {
    return null
  }
  const chats =
    project === undefined
      ? []
      : knownThreads().filter((thread) => thread.projectId === project.id)
  if (
    project !== undefined &&
    db
      .select()
      .from(sessionPlaces)
      .where(eq(sessionPlaces.projectId, project.id))
      .all()
      .some((place) => !chats.some((chat) => chat.id === place.sessionId))
  ) {
    return null
  }
  const last =
    chats.length === 0 ? null : Math.max(...chats.map((chat) => chat.updatedAt))
  if (last !== null && now - last < CHAT_AGE) {
    return null
  }
  const stats = await folderStats(folder)
  const since = last ?? stats.changedAt
  if (now - since < CHAT_AGE) {
    return null
  }
  return {
    id: `chat:${folder}`,
    kind: 'chat',
    title: null,
    folder,
    since,
    bytes: stats.bytes,
  }
}

export function chatTitle(folder: string) {
  const project = projects().find((item) => item.path === folder)
  if (project === undefined) {
    return null
  }
  return (
    knownThreads().find((thread) => thread.projectId === project.id)?.title ??
    null
  )
}

export async function deleteChatItem(item: ChatItem) {
  if (path.dirname(item.folder) !== scratchRoot) {
    throw new Error(`${item.folder} is not a chat folder`)
  }
  const real = realPath(item.folder)
  const project = projects().find((entry) => realPath(entry.path) === real)
  if (project !== undefined && !project.scratch) {
    throw new Error(`${item.folder} is not a chat without a project`)
  }
  const reason = busyReason(real, {
    projectId: project?.id ?? null,
    worktreeIds: [],
  })
  if (reason !== null) {
    throw new Error(`${item.folder} was not deleted because ${reason}`)
  }
  if (project !== undefined) {
    for (const chat of knownThreads().filter(
      (thread) => thread.projectId === project.id
    )) {
      await removeSession(chat.id)
    }
    removeProject(project.id)
  }
  await rm(item.folder, { recursive: true, force: true })
  publishSessions()
  refreshAll()
}
