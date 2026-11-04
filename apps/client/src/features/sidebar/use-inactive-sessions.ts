import { isEqual } from 'es-toolkit'
import { useEffect } from 'react'
import { call } from '@/api/connection'
import { machineKey } from '@/api/machines'
import { getState, showError, update, useStore } from '@/lib/store'

let preloaded: string | null = null

export function useInactiveSessions(
  inactiveOpen: boolean,
  scopeMachine: string | null,
  scopeProject: string | null,
  limit: number
) {
  const inactiveVersion = useStore((state) => state.inactiveVersion)
  const online = useStore((state) =>
    state.machines
      .filter((machine) => machine.status === 'online')
      .map((machine) => machine.id)
      .join(' ')
  )

  useEffect(() => {
    const key = JSON.stringify([scopeMachine, scopeProject, online])
    if (!inactiveOpen && preloaded === key) {
      return
    }
    let current = true
    async function load() {
      const targets = online
        .split(' ')
        .filter(
          (machine) =>
            machine !== '' &&
            (scopeMachine === null || machine === scopeMachine)
        )
      const pages = await Promise.all(
        targets.map(async (machine) => {
          const page = await call(machine, 'sessions.inactive', {
            projectId: scopeProject,
            limit,
          })
          return {
            sessions: page.sessions.map((session) => ({ ...session, machine })),
            total: page.total,
          }
        })
      )
      if (!current) {
        return
      }
      preloaded = key
      const state = getState()
      const known = new Map(
        state.inactive.map((session) => [
          machineKey(session.machine, session.id),
          session,
        ])
      )
      const inactive = pages
        .flatMap((page) => page.sessions)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, limit)
        .map((session) => {
          const previous = known.get(machineKey(session.machine, session.id))
          return previous !== undefined && isEqual(previous, session)
            ? previous
            : session
        })
      const inactiveTotal = pages.reduce((sum, page) => sum + page.total, 0)
      if (
        isEqual(inactive, state.inactive) &&
        inactiveTotal === state.inactiveTotal
      ) {
        return
      }
      update({ inactive, inactiveTotal })
    }
    load().catch(showError)
    return () => {
      current = false
    }
  }, [inactiveOpen, scopeMachine, scopeProject, online, inactiveVersion, limit])
}
