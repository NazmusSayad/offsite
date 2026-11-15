import path from 'node:path'
import type { GitMethods } from '@offsite/core/git'
import { localBranches } from '../services/branches.ts'
import {
  commit,
  commitMessage,
  fetchProject,
  gitRepos,
  listBranches,
  projectDiff,
  pullRequestBranches,
  push,
  switchBranch,
  sync,
} from '../services/git.ts'
import { placePath } from '../services/project-worktrees.ts'
import {
  createPullRequest,
  preparePullRequest,
} from '../services/pull-request-drafts.ts'
import {
  commitFiles,
  history,
  runAction,
  showFile,
  sourceControl,
  undoCommit,
} from '../services/source-control.ts'
import type { Handlers } from './socket.ts'

export const gitHandlers: Pick<Handlers, keyof GitMethods> = {
  'git.status': (params) =>
    gitRepos(placePath(params.projectId, params.worktreeId)),
  'git.diff': (params) =>
    projectDiff(placePath(params.projectId, params.worktreeId)),
  'git.commit': (params) =>
    commit(
      path.join(placePath(params.projectId, params.worktreeId), params.repo),
      params.message,
      params.push,
      params.sessionId
    ),
  'git.changes': (params) =>
    sourceControl(placePath(params.projectId, params.worktreeId)),
  'git.show': (params) =>
    showFile(
      path.join(placePath(params.projectId, params.worktreeId), params.repo),
      params.ref,
      params.path
    ),
  'git.history': (params) =>
    history(
      path.join(placePath(params.projectId, params.worktreeId), params.repo),
      params.limit
    ),
  'git.commitFiles': (params) =>
    commitFiles(
      path.join(placePath(params.projectId, params.worktreeId), params.repo),
      params.hash,
      params.parent
    ),
  'git.message': (params) =>
    commitMessage(
      path.join(placePath(params.projectId, params.worktreeId), params.repo),
      params.staged,
      params.sessionId
    ),
  'git.undoCommit': (params) =>
    undoCommit(
      path.join(placePath(params.projectId, params.worktreeId), params.repo)
    ),
  'git.run': async (params) => {
    await runAction(
      path.join(placePath(params.projectId, params.worktreeId), params.repo),
      params.action
    )
    return null
  },
  'git.push': async (params) => {
    await push(
      path.join(placePath(params.projectId, params.worktreeId), params.repo)
    )
    return null
  },
  'git.sync': async (params) => {
    await sync(
      path.join(placePath(params.projectId, params.worktreeId), params.repo)
    )
    return null
  },
  'git.fetch': async (params) => {
    await fetchProject(placePath(params.projectId, params.worktreeId))
    return null
  },
  'git.branches': (params) =>
    pullRequestBranches(
      path.join(placePath(params.projectId, params.worktreeId), params.repo)
    ),
  'git.localBranches': (params) =>
    localBranches(
      path.join(placePath(params.projectId, params.worktreeId), params.repo)
    ),
  'git.remoteBranches': (params) =>
    listBranches(
      path.join(placePath(params.projectId, params.worktreeId), params.repo),
      true
    ),
  'git.switch': async (params) => {
    await switchBranch(
      path.join(placePath(params.projectId, params.worktreeId), params.repo),
      params.branch,
      params.create
    )
    return null
  },
  'git.pullRequest': (params) =>
    preparePullRequest(
      path.join(placePath(params.projectId, params.worktreeId), params.repo),
      params.base,
      params.commit,
      params.sessionId
    ),
  'git.createPullRequest': (params) =>
    createPullRequest(
      path.join(placePath(params.projectId, params.worktreeId), params.repo),
      params
    ),
}
