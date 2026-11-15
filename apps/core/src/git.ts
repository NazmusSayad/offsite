export type GitRepo = {
  path: string
  branch: string | null
  upstream: string | null
  remote: boolean
  ahead: number
  behind: number
  changed: number
  added: number
  removed: number
}

export type PullRequestBranches = {
  head: string
  base: string
  branches: string[]
}

export type PullRequestDraft =
  | { kind: 'open'; url: string }
  | {
      kind: 'draft'
      base: string
      head: string
      title: string
      body: string
    }

export type WorktreeStage = 'fetch' | 'name' | 'create'

export type WorktreeChoice = {
  worktreeId: string | null
  folder: string
  branch: string | null
  worktree: boolean
  activeAt: number
}

export type WorktreeBases = {
  defaultBase: string
  local: string[]
  remote: string[]
  worktrees: WorktreeChoice[]
}

export type WorktreeState = 'ready' | 'folderMissing' | 'branchMissing'

export type WorktreeDetails = {
  folder: string
  branch: string | null
  changes: number
  commits: number
  ignored: string[]
}

export type GitStatus = 'M' | 'T' | 'A' | 'D' | 'R' | 'C' | 'U' | '!'

export type GitResource = {
  path: string
  from: string | null
  status: GitStatus
}

export type SourceControlRepo = {
  path: string
  head: string | null
  branch: string | null
  upstream: string | null
  remote: boolean
  ahead: number
  behind: number
  merge: GitResource[]
  staged: GitResource[]
  changes: GitResource[]
}

export type GitCommit = {
  hash: string
  parents: string[]
  subject: string
  author: string
  date: number
  refs: string[]
}

export type GitAction =
  | { kind: 'stage'; paths: string[] }
  | { kind: 'stageContent'; path: string; content: string }
  | { kind: 'unstage'; paths: string[] }
  | { kind: 'discard'; tracked: string[]; untracked: string[] }
  | { kind: 'ignore'; paths: string[] }
  | { kind: 'commit'; message: string; all: boolean; amend: boolean }
  | { kind: 'pull'; rebase: boolean }
  | { kind: 'fetch'; prune: boolean; all: boolean }
  | { kind: 'stash'; mode: 'tracked' | 'untracked' | 'staged' }
  | { kind: 'unstash'; pop: boolean }

export type GitMethods = {
  'git.status': {
    params: { projectId: string; worktreeId: string | null }
    result: GitRepo[]
  }
  'git.diff': {
    params: { projectId: string; worktreeId: string | null }
    result: { repo: string; patch: string }[]
  }
  'git.commit': {
    params: {
      projectId: string
      worktreeId: string | null
      repo: string
      message: string
      push: boolean
      sessionId: string | null
    }
    result: { message: string }
  }
  'git.changes': {
    params: { projectId: string; worktreeId: string | null }
    result: SourceControlRepo[]
  }
  'git.show': {
    params: {
      projectId: string
      worktreeId: string | null
      repo: string
      ref: string
      path: string
    }
    result: string | null
  }
  'git.history': {
    params: {
      projectId: string
      worktreeId: string | null
      repo: string
      limit: number
    }
    result: GitCommit[]
  }
  'git.commitFiles': {
    params: {
      projectId: string
      worktreeId: string | null
      repo: string
      hash: string
      parent: string | null
    }
    result: GitResource[]
  }
  'git.message': {
    params: {
      projectId: string
      worktreeId: string | null
      repo: string
      staged: boolean
      sessionId: string | null
    }
    result: string
  }
  'git.undoCommit': {
    params: { projectId: string; worktreeId: string | null; repo: string }
    result: string
  }
  'git.run': {
    params: {
      projectId: string
      worktreeId: string | null
      repo: string
      action: GitAction
    }
    result: null
  }
  'git.push': {
    params: { projectId: string; worktreeId: string | null; repo: string }
    result: null
  }
  'git.sync': {
    params: { projectId: string; worktreeId: string | null; repo: string }
    result: null
  }
  'git.fetch': {
    params: { projectId: string; worktreeId: string | null }
    result: null
  }
  'git.branches': {
    params: { projectId: string; worktreeId: string | null; repo: string }
    result: PullRequestBranches
  }
  'git.localBranches': {
    params: { projectId: string; worktreeId: string | null; repo: string }
    result: {
      name: string
      local: boolean
      default: boolean
      worktree: string | null
    }[]
  }
  'git.remoteBranches': {
    params: { projectId: string; worktreeId: string | null; repo: string }
    result: string[]
  }
  'git.switch': {
    params: {
      projectId: string
      worktreeId: string | null
      repo: string
      branch: string
      create: boolean
    }
    result: null
  }
  'git.pullRequest': {
    params: {
      projectId: string
      worktreeId: string | null
      repo: string
      base: string
      commit: boolean
      sessionId: string | null
    }
    result: PullRequestDraft
  }
  'git.createPullRequest': {
    params: {
      projectId: string
      worktreeId: string | null
      repo: string
      base: string
      head: string
      title: string
      body: string
    }
    result: { url: string }
  }
}
