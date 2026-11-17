import type { CleanupItem, CleanupState } from '@offsite/core/cleanup'
import { z } from 'zod'
import { broadcast } from '../../lib/hub.ts'
import { keyedLock } from '../../lib/locks.ts'
import { logger } from '../../lib/log.ts'
import { readSettings, writeJson } from '../../storage/storage.ts'
import { chatItems, chatTitle, deleteChatItem } from './chats.ts'
import { deleteOldFiles, fileGroupItem } from './folders.ts'
import {
  deleteGenerations,
  deleteReviewGuides,
  generationsItem,
  reviewGuidesItem,
} from './records.ts'
import { deleteWorktreeItem, worktreeItems } from './worktrees.ts'

const DAY = 86_400_000
const FILE = 'cleanup.json'
const log = logger.withTag('cleanup')
const locked = keyedLock()
const savedSchema = z.object({
  checkedAt: z.number().nullable(),
  items: z.array(
    z.discriminatedUnion('kind', [
      z.object({
        id: z.string(),
        kind: z.literal('worktree'),
        project: z.string().nullable(),
        folder: z.string(),
        branch: z.string().nullable(),
        reason: z.enum(['merged', 'pushed', 'unpushed']),
        since: z.number(),
        changes: z.number(),
        commits: z.number(),
        bytes: z.number(),
      }),
      z.object({
        id: z.string(),
        kind: z.literal('chat'),
        title: z.null(),
        folder: z.string(),
        since: z.number(),
        bytes: z.number(),
      }),
      z.object({
        id: z.string(),
        kind: z.enum([
          'uploads',
          'pasted',
          'logs',
          'generations',
          'reviewGuides',
        ]),
        count: z.number(),
        bytes: z.number(),
      }),
    ])
  ),
})

let saved = readSettings(FILE, savedSchema, { checkedAt: null, items: [] })
let checking = false
let timer: NodeJS.Timeout | undefined

export function cleanupState(): CleanupState {
  return {
    checkedAt: saved.checkedAt,
    checking,
    items: saved.items.map((item) =>
      item.kind === 'chat' ? { ...item, title: chatTitle(item.folder) } : item
    ),
  }
}

export function scheduleCleanup() {
  const wait =
    saved.checkedAt === null
      ? 0
      : Math.max(0, saved.checkedAt + DAY - Date.now())
  timer = setTimeout(() => void checkDaily(), wait)
}

async function checkDaily() {
  try {
    await checkCleanup()
  } catch (error) {
    log.warn('could not check for cleanup:', error)
  }
}

export function checkCleanup() {
  return locked('cleanup', async () => {
    clearTimeout(timer)
    checking = true
    publish()
    try {
      const now = Date.now()
      save(now, await findItems(now))
    } finally {
      checking = false
      publish()
      timer = setTimeout(() => void checkDaily(), DAY)
    }
    return cleanupState()
  })
}

export function runCleanup(ids: string[]) {
  return locked('cleanup', async () => {
    const now = Date.now()
    const found = await findItems(now)
    const deleted = new Set<string>()
    const failures: string[] = []
    for (const item of found.filter((entry) => ids.includes(entry.id))) {
      try {
        await deleteItem(item, now)
        deleted.add(item.id)
      } catch (error) {
        log.warn(`could not clean up ${item.id}:`, error)
        failures.push(
          `${item.id}: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    }
    save(
      now,
      found.filter((item) => !deleted.has(item.id))
    )
    publish()
    if (failures.length > 0) {
      throw new Error(`Could not clean up:\n${failures.join('\n')}`)
    }
    return cleanupState()
  })
}

async function findItems(now: number) {
  const found: (CleanupItem | null)[] = [
    ...(await worktreeItems(now)),
    ...(await chatItems(now)),
    await fileGroupItem('uploads', now),
    await fileGroupItem('pasted', now),
    await fileGroupItem('logs', now),
    generationsItem(now),
    reviewGuidesItem(now),
  ]
  return found.filter((item) => item !== null)
}

async function deleteItem(item: CleanupItem, now: number) {
  switch (item.kind) {
    case 'worktree':
      await deleteWorktreeItem(item)
      return
    case 'chat':
      await deleteChatItem(item)
      return
    case 'uploads':
    case 'pasted':
    case 'logs':
      await deleteOldFiles(item.kind, now)
      return
    case 'generations':
      deleteGenerations(now)
      return
    case 'reviewGuides':
      deleteReviewGuides(now)
  }
}

function save(checkedAt: number, items: CleanupItem[]) {
  saved = {
    checkedAt,
    items: items.map((item) =>
      item.kind === 'chat' ? { ...item, title: null } : item
    ),
  }
  writeJson(FILE, saved)
}

function publish() {
  broadcast({ type: 'cleanup', cleanup: cleanupState() })
}
