import type { ProjectPatch } from '@offsite/core/protocol'
import { projectOf, useStore } from '@/lib/store'
import { call } from './connection'

export function useProjectName(machine: string, projectId: string) {
  return useStore((state) => projectOf(state, machine, projectId)?.name ?? '')
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
