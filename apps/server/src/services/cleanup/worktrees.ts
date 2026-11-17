import { existsSync } from 'node:fs'
import path from 'node:path'
import type { CleanupItem } from '@offsite/core/cleanup'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { runs } from '../../lib/live.ts'
import { logger } from '../../lib/log.ts'
import { db } from '../../storage/db.ts'
import { worktrees as worktreesTable } from '../../storage/schema.ts'
import { git } from '../git.ts'
import { publishWorktrees, worktrees } from '../project-worktrees.ts'
import { projects } from '../projects.ts'
import { gh } from '../pull-requests.ts'
import { enabledProviders, refreshAll } from '../sessions.ts'
import { closeWorktreeTerminals } from '../terminal/terminal.ts'
import { knownThreads, threadFailed, threadsReady } from '../threads.ts'
import {
  currentBranch,
  deleteWorktree,
  listWorktrees,
  worktreeRoot,
} from '../worktrees.ts'
import { entries, folderStats } from './folders.ts'

const DAY = 86_400_000
const MERGED_AGE = 3 * DAY
const PUSHED_AGE = 7 * DAY
const UNPUSHED_AGE = 30 * DAY
const log = logger.withTag('cleanup')
const mergedSchema = z.array(z.object({ mergedAt: z.string() }))

export type WorktreeItem = Extract<CleanupItem, { kind: 'worktree' }>

export async function worktreeItems(now: number) {
  const folders = new Map<string, { ids: string[]; project: string | null }>()
  for (const worktree of worktrees()) {
    if (!existsSync(worktree.path)) {
      continue
    }
    const folder = path.resolve(
      (await git(worktree.path, ['rev-parse', '--show-toplevel'])).stdout.trim()
    )
    const project =
      projects().find((item) => item.id === worktree.projectId)?.name ?? null
    folders.set(folder, {
      ids: [...(folders.get(folder)?.ids ?? []), worktree.id],
      project,
    })
  }
  for (const repo of await entries(worktreeRoot)) {
    for (const name of await entries(path.join(worktreeRoot, repo))) {
      const folder = path.join(worktreeRoot, repo, name)
      if (!folders.has(folder)) {
        folders.set(folder, { ids: [], project: null })
      }
    }
  }
  const found: WorktreeItem[] = []
  for (const entry of folders) {
    try {
      const item = await worktreeItem(entry[0], entry[1].project, now)
      if (item !== null) {
        found.push(item)
      }
    } catch (error) {
      log.warn(`could not check the worktree ${entry[0]}:`, error)
    }
  }
  return found
}

async function worktreeItem(
  folder: string,
  project: string | null,
  now: number
): Promise<WorktreeItem | null> {
  if (
    [...runs.values()].some(
      (run) => run.cwd === folder || run.cwd.startsWith(`${folder}${path.sep}`)
    )
  ) {
    return null
  }
  if ((await listWorktrees(folder))[0].folder === folder) {
    return null
  }
  const branch = await currentBranch(folder)
  const changes = (await git(folder, ['status', '--porcelain'])).stdout
    .split('\n')
    .filter((line) => line !== '').length
  const commits = Number(
    (
      await git(folder, ['rev-list', '--count', 'HEAD', '--not', '--remotes'])
    ).stdout.trim()
  )
  const stats = await folderStats(folder)
  const merged = branch === null ? null : await mergedAt(folder, branch)
  const item = {
    id: `worktree:${folder}`,
    kind: 'worktree' as const,
    project,
    folder,
    branch,
    changes,
    commits,
    bytes: stats.bytes,
  }
  if (merged !== null && now - merged >= MERGED_AGE) {
    return { ...item, reason: 'merged', since: merged }
  }
  if (changes === 0 && commits === 0) {
    return now - stats.changedAt >= PUSHED_AGE
      ? { ...item, reason: 'pushed', since: stats.changedAt }
      : null
  }
  return now - stats.changedAt >= UNPUSHED_AGE
    ? { ...item, reason: 'unpushed', since: stats.changedAt }
    : null
}

async function mergedAt(folder: string, branch: string) {
  let output
  try {
    output = await gh(folder, [
      'pr',
      'list',
      '--head',
      branch,
      '--state',
      'merged',
      '--json',
      'mergedAt',
      '--limit',
      '1',
    ])
  } catch (error) {
    log.warn(`could not look up the pull request of ${branch}:`, error)
    return null
  }
  const pull = mergedSchema.parse(JSON.parse(output)).at(0)
  return pull === undefined ? null : Date.parse(pull.mergedAt)
}

export async function deleteWorktreeItem(item: WorktreeItem) {
  const saved = worktrees().filter(
    (worktree) =>
      worktree.path === item.folder ||
      worktree.path.startsWith(`${item.folder}${path.sep}`)
  )
  for (const worktree of saved) {
    closeWorktreeTerminals(worktree.id)
  }
  await deleteWorktree(item.folder, item.folder, item.branch)
  await threadsReady()
  const failed = enabledProviders().some((provider) => threadFailed(provider))
  for (const worktree of saved) {
    if (
      !failed &&
      !knownThreads().some((thread) => thread.worktreeId === worktree.id)
    ) {
      db.delete(worktreesTable).where(eq(worktreesTable.id, worktree.id)).run()
    }
  }
  publishWorktrees()
  refreshAll()
}
