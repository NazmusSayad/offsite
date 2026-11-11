import { listBranches } from './git.ts'
import { currentBranch, knownDefaultBase, listWorktrees } from './worktrees.ts'

export async function localBranches(repo: string) {
  const current = await currentBranch(repo)
  const worktrees = await listWorktrees(repo)
  const branches = (await listBranches(repo, false)).map((name) => ({
    name,
    local: true,
    worktree:
      name === current
        ? null
        : (worktrees.find((worktree) => worktree.branch === name)?.folder ??
          null),
  }))
  const base = await knownDefaultBase(repo)
  if (base === null) {
    return branches
  }
  const name = defaultBranchName(base)
  const local = branches.find((branch) => branch.name === name)
  return [
    local ?? { name, local: false, worktree: null },
    ...branches.filter((branch) => branch.name !== name),
  ]
}

function defaultBranchName(ref: string) {
  if (ref.startsWith('refs/heads/')) {
    return ref.slice('refs/heads/'.length)
  }
  if (ref.startsWith('refs/remotes/origin/')) {
    return ref.slice('refs/remotes/origin/'.length)
  }
  throw new Error(`${ref} is not a branch`)
}
