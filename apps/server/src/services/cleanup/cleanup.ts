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
const HOUR = 3_600_000
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
let attemptedAt: number | null = null

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
  void checkIfDue()
  setInterval(() => void checkIfDue(), HOUR)
}

async function checkIfDue() {
  const now = Date.now()
  if (
    checking ||
    (saved.checkedAt !== null && now - saved.checkedAt < DAY) ||
    (attemptedAt !== null && now - attemptedAt < DAY)
  ) {
    return
  }
  attemptedAt = now
  try {
    await checkCleanup()
  } catch (error) {
    log.warn('could not check for cleanup:', error)
  }
}

export function checkCleanup() {
  return locked('cleanup', async () => {
    checking = true
    publish()
    try {
      const now = Date.now()
      save(now, await findItems(now, null))
    } finally {
      checking = false
      publish()
    }
    return cleanupState()
  })
}

export function runCleanup(ids: string[]) {
  return locked('cleanup', async () => {
    const now = Date.now()
    const found = await findItems(now, ids)
    const deleted = new Set<string>()
    const failures: string[] = []
    for (const item of found) {
      try {
        await deleteItem(item, now)
        deleted.add(item.id)
      } catch (error) {
        log.warn(`could not clean up ${item.id}:`, error)
        failures.push(error instanceof Error ? error.message : String(error))
      }
    }
    for (const item of saved.items) {
      if (
        (item.kind === 'worktree' || item.kind === 'chat') &&
        ids.includes(item.id) &&
        !found.some((entry) => entry.id === item.id)
      ) {
        failures.push(
          `${item.folder} was not deleted because it is in use or changed since the last check`
        )
      }
    }
    save(
      saved.checkedAt,
      saved.items.flatMap((item) => {
        if (!ids.includes(item.id)) {
          return [item]
        }
        const current = found.find((entry) => entry.id === item.id)
        return current === undefined || deleted.has(item.id) ? [] : [current]
      })
    )
    publish()
    if (failures.length > 0) {
      throw new Error(`Could not clean up:\n${failures.join('\n')}`)
    }
    return cleanupState()
  })
}

async function findItems(now: number, ids: string[] | null) {
  const found: (CleanupItem | null)[] = [
    ...(await worktreeItems(now, ids)),
    ...(await chatItems(now, ids)),
  ]
  for (const group of ['uploads', 'pasted', 'logs'] as const) {
    if (ids === null || ids.includes(group)) {
      found.push(await fileGroupItem(group, now))
    }
  }
  if (ids === null || ids.includes('generations')) {
    found.push(generationsItem(now))
  }
  if (ids === null || ids.includes('reviewGuides')) {
    found.push(reviewGuidesItem(now))
  }
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

function save(checkedAt: number | null, items: CleanupItem[]) {
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
