export type Project = {
  id: string
  path: string
  name: string
  logo: string | null
  hidden: boolean
}

export type ProjectPatch = {
  name?: string
  logo?: string | null
  hidden?: boolean
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
