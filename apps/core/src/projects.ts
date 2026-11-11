export const NO_PROJECT = 'no-project'

export type Project = {
  id: string
  path: string
  name: string
  logo: string | null
  pinned: boolean
  score: number
  scratch: boolean
  parentId: string | null
  worktreeSetup: string | null
  worktreeBranch: string | null
}

export type ProjectPatch = {
  name?: string
  logo?: string | null
  pinned?: boolean
  scratch?: false
  worktreeSetup?: string
}

export type DirectoryListing = {
  path: string
  parent: string | null
  directories: { name: string; path: string }[]
}

export type FilePreview =
  | { kind: 'text'; size: number; content: string }
  | { kind: 'image'; size: number; mediaType: string; data: string }
  | { kind: 'binary'; size: number }
  | { kind: 'large'; size: number; limit: number }
