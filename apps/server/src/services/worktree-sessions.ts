import { runs } from '../lib/live.ts'
import { db } from '../storage/db.ts'
import { sessionPlaces } from '../storage/schema.ts'
import {
  deleteSavedWorktree,
  findWorktree,
  type Place,
  placeAtFolder,
  worktrees,
} from './project-worktrees.ts'
import { findProject, projects, removeProject } from './projects.ts'
import {
  enabledProviders,
  providerOf,
  refreshAll,
  refreshSessions,
} from './sessions.ts'
import { closeWorktreeTerminals, startSetup } from './terminal/terminal.ts'
import {
  knownThreads,
  markChanged,
  threadFailed,
  threadsReady,
} from './threads.ts'

export function placeSession(
  sessionId: string,
  place: Place,
  claudeWorktree: boolean
) {
  const values = {
    projectId: place.projectId,
    worktreeId: place.worktreeId,
    claudeWorktree,
  }
  db.insert(sessionPlaces)
    .values({ sessionId, ...values })
    .onConflictDoUpdate({ target: sessionPlaces.sessionId, set: values })
    .run()
  const provider = providerOf(sessionId)
  markChanged(provider, sessionId)
  refreshSessions(provider)
}

export async function followClaudeFolder(
  sessionId: string,
  cwd: string,
  folder: string,
  change: 'entered' | 'left' | 'started'
) {
  placeSession(sessionId, await placeAtFolder(cwd, folder), change !== 'left')
}

export async function unusedWorktree(place: Place) {
  const project = projects().find((item) => item.id === place.projectId)
  if (project === undefined) {
    return null
  }
  if (!project.scratch && place.worktreeId === null) {
    return null
  }
  const folder =
    place.worktreeId === null
      ? project.path
      : worktrees().find((item) => item.id === place.worktreeId)?.path
  if (folder === undefined) {
    return null
  }
  await threadsReady()
  if (
    enabledProviders().some((owner) => threadFailed(owner)) ||
    knownThreads().some(
      (item) =>
        item.projectId === place.projectId &&
        item.worktreeId === place.worktreeId
    ) ||
    [...runs.values()].some((run) => run.cwd === folder)
  ) {
    return null
  }
  if (project.scratch) {
    removeProject(project.id)
    return null
  }
  return place.worktreeId
}

export async function deleteUnusedWorktree(worktreeId: string) {
  const worktree = findWorktree(worktreeId)
  if (
    (await unusedWorktree({ projectId: worktree.projectId, worktreeId })) !==
    worktreeId
  ) {
    throw new Error('Only a worktree without chats can be deleted')
  }
  closeWorktreeTerminals(worktreeId)
  await deleteSavedWorktree(worktreeId)
  refreshAll()
}

export function setUpWorktree(worktreeId: string) {
  const worktree = findWorktree(worktreeId)
  const project = findProject(worktree.projectId)
  if (project.worktreeSetup === null) {
    return false
  }
  startSetup(
    { projectId: worktree.projectId, worktreeId },
    project.worktreeSetup,
    { OFFSITE_ROOT: project.path, OFFSITE_WORKTREE: worktree.path }
  )
  return true
}
