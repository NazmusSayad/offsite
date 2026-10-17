export type GitRepo = {
  path: string
  branch: string | null
  upstream: string | null
  ahead: number
  behind: number
  changed: number
}

export type PullRequestDraft =
  | { kind: 'open'; url: string }
  | {
      kind: 'draft'
      base: string
      head: string
      branches: string[]
      title: string
      body: string
    }
