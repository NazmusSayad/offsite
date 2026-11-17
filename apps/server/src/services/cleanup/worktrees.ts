import { execFile } from 'node:child_process'
import { lstat } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import type { CleanupItem } from '@offsite/core/cleanup'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { logger } from '../../lib/log.ts'
import { db } from '../../storage/db.ts'
import {
  sessionPlaces,
  worktrees as worktreesTable,
} from '../../storage/schema.ts'
import { git } from '../git.ts'
import { publishWorktrees, worktrees } from '../project-worktrees.ts'
import { projects } from '../projects.ts'
import { enabledProviders, refreshAll } from '../sessions.ts'
import { knownThreads, threadFailed, threadsReady } from '../threads.ts'
import {
  currentBranch,
  deleteWorktree,
  listWorktrees,
  worktreeRoot,
} from '../worktrees.ts'
import { entries, folderStats, inside, realPath } from './folders.ts'
import { busyReason } from './usage.ts'

const DAY = 86_400_000
const MERGED_AGE = 3 * DAY
const PUSHED_AGE = 7 * DAY
const UNPUSHED_AGE = 30 * DAY
const GH_TIMEOUT = 60_000
const run = promisify(execFile)
const log = logger.withTag('cleanup')
const mergedSchema = z.array(
  z.object({ mergedAt: z.string(), headRefOid: z.string() })
)

export type WorktreeItem = Extract<CleanupItem, { kind: 'worktree' }>

export async function worktreeItems(now: number, ids: string[] | null) {
  const found: WorktreeItem[] = []
  for (const repo of await entries(worktreeRoot)) {
    for (const name of await entries(path.join(worktreeRoot, repo))) {
      const folder = path.join(worktreeRoot, repo, name)
      if (ids !== null && !ids.includes(`worktree:${folder}`)) {
        continue
      }
      try {
        const item = await worktreeItem(folder, now)
        if (item !== null) {
          found.push(item)
        }
      } catch (error) {
        log.warn(`could not check the worktree ${folder}:`, error)
      }
    }
  }
  return found
}

async function worktreeItem(
  folder: string,
  now: number
): Promise<WorktreeItem | null> {
  if (!(await lstat(folder)).isDirectory()) {
    return null
  }
  const real = realPath(folder)
  const top = path.resolve(
    (await git(folder, ['rev-parse', '--show-toplevel'])).stdout.trim()
  )
  if (top !== real || (await listWorktrees(folder))[0].folder === real) {
    return null
  }
  const rows = ownRows(real)
  if (
    busyReason(real, {
      projectId: null,
      worktreeIds: rows.map((row) => row.id),
    }) !== null
  ) {
    return null
  }
  const branch = await currentBranch(folder)
  const changes = (
    await git(folder, ['--no-optional-locks', 'status', '--porcelain'])
  ).stdout
    .split('\n')
    .filter((line) => line !== '').length
  const commits = Number(
    (
      await git(folder, [
        'rev-list',
        '--count',
        'HEAD',
        '--not',
        ...(branch === null ? ['--branches'] : []),
        '--remotes',
      ])
    ).stdout.trim()
  )
  const stats = await folderStats(folder)
  const merged = branch === null ? null : await mergedAt(folder, branch)
  const item = {
    id: `worktree:${folder}`,
    kind: 'worktree' as const,
    project:
      projects().find((project) => project.id === rows.at(0)?.projectId)
        ?.name ?? null,
    folder,
    branch,
    changes,
    commits,
    bytes: stats.bytes,
  }
  if (
    merged !== null &&
    now - merged >= MERGED_AGE &&
    now - stats.changedAt >= MERGED_AGE
  ) {
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

function ownRows(folder: string) {
  return worktrees().filter((worktree) =>
    inside(realPath(worktree.path), folder)
  )
}

async function mergedAt(folder: string, branch: string) {
  const head = (await git(folder, ['rev-parse', 'HEAD'])).stdout.trim()
  try {
    const output = await run(
      'gh',
      [
        'pr',
        'list',
        '--head',
        branch,
        '--state',
        'merged',
        '--json',
        'mergedAt,headRefOid',
        '--limit',
        '20',
      ],
      {
        cwd: folder,
        env: { ...process.env, GH_PROMPT_DISABLED: '1', NO_COLOR: '1' },
        timeout: GH_TIMEOUT,
      }
    )
    const pull = mergedSchema
      .parse(JSON.parse(output.stdout))
      .find((item) => item.headRefOid === head)
    return pull === undefined ? null : Date.parse(pull.mergedAt)
  } catch (error) {
    log.warn(`could not look up the pull request of ${branch}:`, error)
    return null
  }
}

export async function deleteWorktreeItem(item: WorktreeItem) {
  const real = realPath(item.folder)
  const rows = ownRows(real)
  const reason = busyReason(real, {
    projectId: null,
    worktreeIds: rows.map((row) => row.id),
  })
  if (reason !== null) {
    throw new Error(`${item.folder} was not deleted because ${reason}`)
  }
  await deleteWorktree(item.folder, item.folder, item.branch)
  await threadsReady()
  const failed = enabledProviders().some((provider) => threadFailed(provider))
  for (const row of rows) {
    if (
      !failed &&
      !knownThreads().some((thread) => thread.worktreeId === row.id) &&
      db
        .select()
        .from(sessionPlaces)
        .where(eq(sessionPlaces.worktreeId, row.id))
        .get() === undefined
    ) {
      db.delete(worktreesTable).where(eq(worktreesTable.id, row.id)).run()
    }
  }
  publishWorktrees()
  refreshAll()
}
