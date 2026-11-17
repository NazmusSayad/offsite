import { rm } from 'node:fs/promises'
import path from 'node:path'
import type { CleanupItem } from '@offsite/core/cleanup'
import { runs } from '../../lib/live.ts'
import { projects, removeProject, scratchRoot } from '../projects.ts'
import {
  enabledProviders,
  publishSessions,
  refreshAll,
  removeSession,
} from '../sessions.ts'
import { knownThreads, threadFailed, threadsReady } from '../threads.ts'
import { entries, folderStats } from './folders.ts'

const CHAT_AGE = 30 * 86_400_000

export type ChatItem = Extract<CleanupItem, { kind: 'chat' }>

export async function chatItems(now: number) {
  await threadsReady()
  if (enabledProviders().some((provider) => threadFailed(provider))) {
    return []
  }
  const found: ChatItem[] = []
  for (const name of await entries(scratchRoot)) {
    const folder = path.join(scratchRoot, name)
    if (
      [...runs.values()].some(
        (run) =>
          run.cwd === folder || run.cwd.startsWith(`${folder}${path.sep}`)
      )
    ) {
      continue
    }
    const project = projects().find((item) => item.path === folder)
    if (project !== undefined && !project.scratch) {
      continue
    }
    const chats =
      project === undefined
        ? []
        : knownThreads().filter((thread) => thread.projectId === project.id)
    const stats = await folderStats(folder)
    const since =
      chats.length === 0
        ? stats.changedAt
        : Math.max(...chats.map((chat) => chat.updatedAt))
    if (now - since >= CHAT_AGE) {
      found.push({
        id: `chat:${folder}`,
        kind: 'chat',
        title: null,
        folder,
        since,
        bytes: stats.bytes,
      })
    }
  }
  return found
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
  const project = projects().find((entry) => entry.path === item.folder)
  if (project !== undefined) {
    if (!project.scratch) {
      throw new Error(`${item.folder} is not a chat without a project`)
    }
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
