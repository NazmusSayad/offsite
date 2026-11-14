import {
  addExistingWorktree,
  placePath,
  projectBases,
  projectWorktrees,
  savedWorktreeDetails,
  worktreeState,
} from '../services/project-worktrees.ts'
import { publishSessions, removeSession } from '../services/sessions.ts'
import { moveToMain, moveToWorktree } from '../services/worktree-moves.ts'
import {
  deleteUnusedWorktree,
  unusedWorktree,
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
    savedWorktreeDetails(params.worktreeId),
  'projects.removeWorktree': async (params) => {
    await deleteUnusedWorktree(params.worktreeId)
    return null
  },
  'sessions.remove': async (params) => {
    try {
      await removeSession(params.id)
    } finally {
      publishSessions()
    }
    return { unusedWorktree: await unusedWorktree(params) }
  },
  'sessions.moveChanges': (params) =>
    uncommittedFiles(placePath(params.projectId, params.worktreeId)),
  'sessions.move': (params, client) =>
    moveToWorktree(client, params.sessionId, params.name),
  'sessions.moveToMain': (params) => moveToMain(params.sessionId),
  'projects.worktreeState': (params) => worktreeState(params.worktreeId),
}
