export const NO_PROJECT = 'no-project'

export function projectColorIndex(name: string, count: number) {
  let index = 0
  for (const glyph of name.normalize('NFKC').trim().toLowerCase()) {
    index = (index * 31 + (glyph.codePointAt(0) ?? 0)) % count
  }
  return index
}

export type Project = {
  id: string
  path: string
  name: string
  logo: string | null
  pinned: boolean
  hidden: boolean
  score: number
  scratch: boolean
  worktreeSetup: string | null
  startInWorktree: boolean
}

export type Worktree = {
  id: string
  projectId: string
  path: string
  branch: string | null
}

export type ProjectPatch = {
  name?: string
  logo?: string | null
  pinned?: boolean
  hidden?: boolean
  scratch?: false
  worktreeSetup?: string
  startInWorktree?: boolean
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
