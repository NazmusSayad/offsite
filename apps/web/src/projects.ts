import type { ProjectPatch } from '@server/protocol'
import { projectName } from '@/lib/format'
import { call } from './connection'
import { useStore } from './store'

export function useProjectName(machine: string, cwd: string) {
  return useStore(
    (state) =>
      state.projects.find(
        (project) => project.machine === machine && project.path === cwd
      )?.name ?? projectName(cwd)
  )
}

export async function addProject(machine: string, path: string) {
  return await call(machine, 'projects.add', { path })
}

export async function updateProject(
  machine: string,
  path: string,
  patch: ProjectPatch
) {
  await call(machine, 'projects.update', { path, patch })
}

export async function removeProject(machine: string, path: string) {
  await call(machine, 'projects.remove', { path })
}
