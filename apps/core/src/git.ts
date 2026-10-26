export type GitRepo = {
  path: string
  branch: string | null
  upstream: string | null
  remote: boolean
  ahead: number
  behind: number
  changed: number
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
  | { kind: 'unstage'; paths: string[] }
  | { kind: 'discard'; tracked: string[]; untracked: string[] }
  | { kind: 'ignore'; paths: string[] }
  | { kind: 'commit'; message: string; all: boolean; amend: boolean }
  | { kind: 'pull'; rebase: boolean }
  | { kind: 'fetch'; prune: boolean; all: boolean }
  | { kind: 'stash'; mode: 'tracked' | 'untracked' | 'staged' }
  | { kind: 'unstash'; pop: boolean }
