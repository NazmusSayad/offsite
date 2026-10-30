import type { GitCommit, GitResource, GitStatus } from '@offsite/core/git'
import { baseName, parentOf } from '@/features/files/explorer'

export type Side =
  | { kind: 'worktree' }
  | { kind: 'git'; ref: string; path: string }
  | { kind: 'empty' }

export type TabSpec = {
  id: string
  repo: string
  path: string
  label: string
  left: Side | null
  right: Side
  preview?: boolean
}

export type Group = 'merge' | 'staged' | 'changes'

export type Sort = 'name' | 'path' | 'status'

export type Node =
  | {
      kind: 'folder'
      path: string
      label: string
      children: Node[]
      resources: GitResource[]
    }
  | { kind: 'file'; resource: GitResource }

type Folder = { folders: Map<string, Folder>; files: GitResource[] }

export const statusNames: Record<GitStatus, string> = {
  M: 'Modified',
  T: 'Type Changed',
  A: 'Added',
  D: 'Deleted',
  R: 'Renamed',
  C: 'Copied',
  U: 'Untracked',
  '!': 'Conflict',
}

export const statusColors: Record<GitStatus, string> = {
  M: 'text-warning',
  T: 'text-warning',
  A: 'text-success',
  D: 'text-destructive',
  R: 'text-success',
  C: 'text-success',
  U: 'text-success',
  '!': 'text-destructive',
}

export function projectFile(repo: string, file: string) {
  return repo === '' ? file : `${repo}/${file}`
}

export function shortHash(hash: string) {
  return hash.slice(0, 7)
}

export function changeTab(
  repo: string,
  group: Group,
  resource: GitResource
): TabSpec {
  const path = projectFile(repo, resource.path)
  const index: Side = { kind: 'git', ref: '', path: resource.path }
  function tab(suffix: string, left: Side | null, right: Side): TabSpec {
    return {
      id: `${suffix}:${path}`,
      repo,
      path,
      label: `${baseName(path)} (${suffix})`,
      left,
      right,
    }
  }
  if (group === 'merge') {
    return tab('Working Tree', null, { kind: 'worktree' })
  }
  if (group === 'staged' && resource.status === 'A') {
    return tab('Index', null, index)
  }
  if (group === 'staged' && resource.status === 'D') {
    return tab('Deleted', null, {
      kind: 'git',
      ref: 'HEAD',
      path: resource.path,
    })
  }
  if (group === 'staged') {
    return tab(
      'Index',
      { kind: 'git', ref: 'HEAD', path: resource.from ?? resource.path },
      index
    )
  }
  if (resource.status === 'U') {
    return tab('Untracked', null, { kind: 'worktree' })
  }
  if (resource.status === 'A') {
    return tab('Intent to Add', null, { kind: 'worktree' })
  }
  if (resource.status === 'D') {
    return tab('Deleted', null, index)
  }
  return tab('Working Tree', index, { kind: 'worktree' })
}

export function fileTab(repo: string, path: string): TabSpec {
  return {
    id: `File:${path}`,
    repo,
    path,
    label: baseName(path),
    left: null,
    right: { kind: 'worktree' },
  }
}

export function previewTab(repo: string, path: string): TabSpec {
  return {
    ...fileTab(repo, path),
    id: `Preview:${path}`,
    label: `${baseName(path)} (Preview)`,
    preview: true,
  }
}

export function headTab(repo: string, resource: GitResource): TabSpec {
  const path = projectFile(repo, resource.path)
  return {
    id: `HEAD:${path}`,
    repo,
    path,
    label: `${baseName(path)} (HEAD)`,
    left: null,
    right: { kind: 'git', ref: 'HEAD', path: resource.from ?? resource.path },
  }
}

export function commitTab(
  repo: string,
  commit: GitCommit,
  resource: GitResource
): TabSpec {
  const path = projectFile(repo, resource.path)
  const parent = commit.parents.at(0) ?? null
  return {
    id: `${commit.hash}:${path}`,
    repo,
    path,
    label: `${baseName(path)} (${parent === null ? 'empty' : shortHash(parent)} ↔ ${shortHash(commit.hash)})`,
    left:
      parent === null || resource.status === 'A'
        ? { kind: 'empty' }
        : { kind: 'git', ref: parent, path: resource.from ?? resource.path },
    right:
      resource.status === 'D'
        ? { kind: 'empty' }
        : { kind: 'git', ref: commit.hash, path: resource.path },
  }
}

export function sortResources(resources: GitResource[], sort: Sort) {
  return [...resources].sort((left, right) => {
    if (sort === 'name') {
      return (
        baseName(left.path).localeCompare(baseName(right.path)) ||
        left.path.localeCompare(right.path)
      )
    }
    if (sort === 'status') {
      return (
        left.status.localeCompare(right.status) ||
        left.path.localeCompare(right.path)
      )
    }
    return left.path.localeCompare(right.path)
  })
}

export function buildTree(resources: GitResource[], sort: Sort) {
  const root: Folder = { folders: new Map(), files: [] }
  for (const resource of resources) {
    let folder = root
    const parent = parentOf(resource.path)
    for (const part of parent === '' ? [] : parent.split('/')) {
      const child = folder.folders.get(part) ?? {
        folders: new Map(),
        files: [],
      }
      folder.folders.set(part, child)
      folder = child
    }
    folder.files.push(resource)
  }
  return toNodes(root, '', sort)
}

function toNodes(folder: Folder, parent: string, sort: Sort): Node[] {
  return [
    ...[...folder.folders]
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map((entry): Node => {
        let label = entry[0]
        let child = entry[1]
        while (child.files.length === 0 && child.folders.size === 1) {
          const only = [...child.folders][0]
          label = `${label}/${only[0]}`
          child = only[1]
        }
        const path = parent === '' ? label : `${parent}/${label}`
        const children = toNodes(child, path, sort)
        return {
          kind: 'folder',
          path,
          label,
          children,
          resources: children.flatMap((node) =>
            node.kind === 'file' ? [node.resource] : node.resources
          ),
        }
      }),
    ...sortResources(folder.files, sort).map((resource): Node => ({
      kind: 'file',
      resource,
    })),
  ]
}
