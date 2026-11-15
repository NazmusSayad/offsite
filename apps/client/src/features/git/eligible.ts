import type { GitRepo } from '@offsite/core/git'

export type Action = 'commit' | 'push' | 'pullRequest'

export function eligible(repos: GitRepo[], action: Action) {
  if (action === 'commit') {
    return repos.filter((repo) => repo.changed > 0)
  }
  if (action === 'push') {
    return repos.filter(
      (repo) =>
        repo.branch !== null && (repo.upstream === null || repo.ahead > 0)
    )
  }
  if (action === 'pullRequest') {
    return repos.filter((repo) => repo.branch !== null)
  }
  throw new Error(`Unknown git action ${String(action)}`)
}
