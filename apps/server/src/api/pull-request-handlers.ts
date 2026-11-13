import path from 'node:path'
import { projectPath } from '../services/projects.ts'
import {
  listPullRequests,
  pullRequestDiff,
  runPullRequestAction,
  viewPullRequest,
} from '../services/pull-requests.ts'
import { reviewGuide, writeReviewGuide } from '../services/review-guide.ts'
import type { Handlers } from './socket.ts'

export const pullRequestHandlers: Pick<
  Handlers,
  | 'pulls.list'
  | 'pulls.view'
  | 'pulls.diff'
  | 'pulls.run'
  | 'pulls.guide'
  | 'pulls.writeGuide'
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
  'pulls.guide': (params) =>
    reviewGuide(
      path.join(projectPath(params.projectId), params.repo),
      params.number
    ),
  'pulls.writeGuide': (params) =>
    writeReviewGuide(
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
