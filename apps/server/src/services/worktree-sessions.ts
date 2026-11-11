import { runs } from '../lib/live.ts'
import { db } from '../storage/db.ts'
import { sessionPlaces } from '../storage/schema.ts'
import {
  deleteWorktreeProject,
  projectAtFolder,
  projects,
  removeProject,
  rootProject,
} from './projects.ts'
import {
  enabledProviders,
  providerOf,
  refreshAll,
  refreshSessions,
} from './sessions.ts'
import { closeProjectTerminals, startSetup } from './terminal/terminal.ts'
import {
  knownThreads,
  markChanged,
  threadFailed,
  threadsReady,
} from './threads.ts'

export function placeSession(
  sessionId: string,
  projectId: string,
  claudeWorktree: boolean
) {
  db.insert(sessionPlaces)
    .values({ sessionId, projectId, claudeWorktree })
    .onConflictDoUpdate({
      target: sessionPlaces.sessionId,
      set: { projectId, claudeWorktree },
    })
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
  const project = projects().find((item) => item.path === cwd)
  if (project === undefined) {
    throw new Error(`${cwd} is not a project`)
  }
  placeSession(
    sessionId,
    await projectAtFolder(project.id, folder),
    change !== 'left'
  )
}

export async function unusedProject(projectId: string) {
  const project = projects().find((item) => item.id === projectId)
  if (
    project === undefined ||
    (!project.scratch && project.parentId === null)
  ) {
    return null
  }
  await threadsReady()
  if (
    enabledProviders().some((owner) => threadFailed(owner)) ||
    knownThreads().some((item) => item.projectId === project.id) ||
    [...runs.values()].some((run) => run.cwd === project.path)
  ) {
    return null
  }
  if (project.scratch) {
    removeProject(project.id)
    return null
  }
  return project.id
}

export async function deleteUnusedWorktree(projectId: string) {
  if ((await unusedProject(projectId)) !== projectId) {
    throw new Error('Only a worktree without chats can be deleted')
  }
  closeProjectTerminals(projectId)
  await deleteWorktreeProject(projectId)
  refreshAll()
}

export function setUpWorktree(projectId: string) {
  const root = rootProject(projectId)
  if (root.worktreeSetup === null) {
    return false
  }
  const project = projects().find((item) => item.id === projectId)
  if (project === undefined) {
    throw new Error('That project was removed')
  }
  startSetup(projectId, root.worktreeSetup, {
    OFFSITE_ROOT: root.path,
    OFFSITE_WORKTREE: project.path,
  })
  return true
}
