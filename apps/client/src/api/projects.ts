import { NO_PROJECT, type ProjectPatch } from '@offsite/core/projects'
import { projectOf, useStore } from '@/lib/store'
import { call } from './connection'

export function useProjectName(machine: string, projectId: string) {
  return useStore((state) =>
    projectId === NO_PROJECT
      ? 'Chat'
      : (projectOf(state, machine, projectId)?.name ?? '')
  )
}

export function useWorktreeBranch(machine: string, projectId: string) {
  return useStore((state) => {
    const project = projectOf(state, machine, projectId)
    return project === undefined ? null : worktreeBranch(project)
  })
}

export function worktreeBranch(project: {
  parentId: string | null
  worktreeBranch: string | null
}) {
  if (project.parentId === null) {
    return null
  }
  return project.worktreeBranch ?? 'Worktree'
}

export function withWorktrees<
  T extends { id: string; parentId: string | null },
>(projects: T[]) {
  return projects
    .filter((project) => project.parentId === null)
    .flatMap((root) => [
      root,
      ...projects.filter((project) => project.parentId === root.id),
    ])
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

export async function reorderProjects(machine: string, ids: string[]) {
  await call(machine, 'projects.reorder', { ids })
}
