import type { ProjectPatch } from '@server/protocol'
import { projectName } from '@/lib/format'
import { call } from './connection'
import { refreshSessions, useStore } from './store'

export function useProjectName(cwd: string) {
  return useStore(
    (state) =>
      state.projects.find((project) => project.path === cwd)?.name ??
      projectName(cwd)
  )
}

export async function addProject(path: string) {
  const project = await call('projects.add', { path })
  await refreshSessions()
  return project
}

export async function updateProject(path: string, patch: ProjectPatch) {
  await call('projects.update', { path, patch })
}

export async function removeProject(path: string) {
  await call('projects.remove', { path })
  await refreshSessions()
}
