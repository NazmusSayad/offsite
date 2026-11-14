import {
  addExistingWorktree,
  projectBases,
  projectPath,
  projectWorktrees,
  worktreeProjectDetails,
  worktreeState,
} from '../services/projects.ts'
import { publishSessions, removeSession } from '../services/sessions.ts'
import { moveToMain, moveToWorktree } from '../services/worktree-moves.ts'
import {
  deleteUnusedWorktree,
  unusedProject,
} from '../services/worktree-sessions.ts'
import { uncommittedFiles } from '../services/worktrees.ts'
import type { Handlers } from './socket.ts'

export const worktreeHandlers: Pick<
  Handlers,
  | 'projects.worktrees'
  | 'projects.addWorktree'
  | 'projects.bases'
  | 'projects.worktreeDetails'
  | 'projects.removeWorktree'
  | 'sessions.remove'
  | 'sessions.moveChanges'
  | 'sessions.move'
  | 'sessions.moveToMain'
  | 'projects.worktreeState'
> = {
  'projects.worktrees': (params) => projectWorktrees(params.projectId),
  'projects.addWorktree': (params) =>
    addExistingWorktree(params.projectId, params.folder),
  'projects.bases': (params) => projectBases(params.projectId, params.query),
  'projects.worktreeDetails': (params) =>
    worktreeProjectDetails(params.projectId),
  'projects.removeWorktree': async (params) => {
    await deleteUnusedWorktree(params.projectId)
    return null
  },
  'sessions.remove': async (params) => {
    try {
      await removeSession(params.id)
    } finally {
      publishSessions()
    }
    return { unusedWorktree: await unusedProject(params.projectId) }
  },
  'sessions.moveChanges': (params) =>
    uncommittedFiles(projectPath(params.projectId)),
  'sessions.move': (params, client) =>
    moveToWorktree(client, params.sessionId, params.name),
  'sessions.moveToMain': (params) => moveToMain(params.sessionId),
  'projects.worktreeState': (params) => worktreeState(params.projectId),
}
