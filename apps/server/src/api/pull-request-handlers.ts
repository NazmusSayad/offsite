import os from 'node:os'
import path from 'node:path'
import { NO_PROJECT } from '@offsite/core/projects'
import { git, projectRepos } from '../services/git.ts'
import { projectPath } from '../services/projects.ts'
import {
  listPullRequests,
  pullRequestDiff,
  repoOf,
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
      params.filter,
      params.fresh
    ),
  'pulls.view': async (params) =>
    viewPullRequest(
      await localRepo(params.projectId, params.url),
      params.url,
      params.fresh
    ),
  'pulls.diff': (params) => pullRequestDiff(params.url, params.head),
  'pulls.guide': (params) => reviewGuide(params.url),
  'pulls.writeGuide': async (params) =>
    writeReviewGuide(
      (await localRepo(params.projectId, params.url)) ?? os.homedir(),
      params.url
    ),
  'pulls.run': async (params) => {
    const local = await localRepo(params.projectId, params.url)
    if (params.action.kind === 'checkout' && local === null) {
      throw new Error(
        'This project has no clone of the repository of this pull request'
      )
    }
    await runPullRequestAction(local ?? os.homedir(), params.url, params.action)
    return null
  },
}

async function localRepo(projectId: string, url: string) {
  if (projectId === NO_PROJECT) {
    return null
  }
  const target = repoOf(url)
  const suffixes = [
    `${target.host}/${target.owner}/${target.name}`,
    `${target.host}:${target.owner}/${target.name}`,
  ].map((suffix) => suffix.toLowerCase())
  const root = projectPath(projectId)
  for (const repo of await projectRepos(root)) {
    const cwd = path.join(root, repo)
    const remotes = (await git(cwd, ['remote', '-v'])).stdout
      .split('\n')
      .filter(Boolean)
      .map((line) =>
        line
          .split(/\s+/)[1]
          .toLowerCase()
          .replace(/\/$/, '')
          .replace(/\.git$/, '')
      )
    if (
      remotes.some((remote) =>
        suffixes.some((suffix) => remote.endsWith(suffix))
      )
    ) {
      return cwd
    }
  }
  return null
}
