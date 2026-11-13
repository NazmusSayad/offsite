import path from 'node:path'
import { projectPath } from '../services/projects.ts'
import {
  listPullRequests,
  pullRequestDiff,
  runPullRequestAction,
  viewPullRequest,
} from '../services/pull-requests.ts'
import type { Handlers } from './socket.ts'

export const pullRequestHandlers: Pick<
  Handlers,
  'pulls.list' | 'pulls.view' | 'pulls.diff' | 'pulls.run'
> = {
  'pulls.list': (params) =>
    listPullRequests(
      path.join(projectPath(params.projectId), params.repo),
      params.filter
    ),
  'pulls.view': (params) =>
    viewPullRequest(
      path.join(projectPath(params.projectId), params.repo),
      params.number
    ),
  'pulls.diff': (params) =>
    pullRequestDiff(
      path.join(projectPath(params.projectId), params.repo),
      params.number
    ),
  'pulls.run': async (params) => {
    await runPullRequestAction(
      path.join(projectPath(params.projectId), params.repo),
      params.number,
      params.action
    )
    return null
  },
}
