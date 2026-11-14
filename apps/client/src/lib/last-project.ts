import { NO_PROJECT } from '@offsite/core/projects'
import { getState } from './store'

export function lastProject() {
  const state = getState()
  const raw = localStorage.getItem('lastProject')
  const last: { machine: string; projectId: string } | null =
    raw === null ? null : JSON.parse(raw)
  const projectless = state.machines.filter(
    (machine) => machine.system?.scratchAvailable === true
  )
  if (
    last !== null &&
    last.projectId === NO_PROJECT &&
    projectless.some((machine) => machine.id === last.machine)
  ) {
    return last
  }
  const registered =
    last === null
      ? undefined
      : state.projects.find(
          (project) =>
            project.machine === last.machine && project.id === last.projectId
        )
  const project = registered ?? state.projects.find((item) => !item.scratch)
  if (project !== undefined) {
    return { machine: project.machine, projectId: project.id }
  }
  if (projectless.length > 0) {
    return { machine: projectless[0].id, projectId: NO_PROJECT }
  }
  return null
}
