import { NO_PROJECT, type ProjectPatch } from '@offsite/core/projects'
import { projectOf, useStore, worktreeOf } from '@/lib/store'
import { call } from './connection'

export function useProjectName(machine: string, projectId: string) {
  return useStore((state) =>
    projectId === NO_PROJECT
      ? 'Chat'
      : (projectOf(state, machine, projectId)?.name ?? '')
  )
}

export function useWorktreeBranch(machine: string, worktreeId: string | null) {
  return useStore((state) => {
    if (worktreeId === null) {
      return null
    }
    const worktree = worktreeOf(state, machine, worktreeId)
    return worktree === undefined ? null : worktreeBranch(worktree)
  })
}

export function worktreeBranch(worktree: { branch: string | null }) {
  return worktree.branch ?? 'Worktree'
}

export function rankProjects<T extends { pinned: boolean; score: number }>(
  projects: T[]
) {
  const sorted = [...projects].sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || b.score - a.score
  )
  const shown = Math.max(5, projects.filter((project) => project.pinned).length)
  return { top: sorted.slice(0, shown), more: sorted.slice(shown) }
}

export function homePath(path: string, home: string) {
  if (path === home) {
    return '~'
  }
  if (path.startsWith(`${home}/`) || path.startsWith(`${home}\\`)) {
    return `~${path.slice(home.length)}`
  }
  return path
}

export async function addProject(machine: string, path: string) {
  return await call(machine, 'projects.add', { path })
}

export async function updateProject(
  machine: string,
  id: string,
  patch: ProjectPatch
) {
  await call(machine, 'projects.update', { id, patch })
}

export async function removeProject(machine: string, id: string) {
  await call(machine, 'projects.remove', { id })
}
