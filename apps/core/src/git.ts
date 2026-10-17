export type GitRepo = {
  path: string
  branch: string | null
  upstream: string | null
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
