import { isEqual } from 'es-toolkit'
import { useEffect } from 'react'
import { call } from '@/api/connection'
import { getState, showError, update, useStore } from '@/lib/store'

export function useInactiveSessions(
  inactiveOpen: boolean,
  scopeMachine: string | null,
  scopeProject: string | null,
  limit: number
) {
  const inactiveVersion = useStore((state) => state.inactiveVersion)

  useEffect(() => {
    if (!inactiveOpen) {
      return
    }
    let current = true
    async function load() {
      const targets =
        scopeMachine === null
          ? getState()
              .machines.filter((machine) => machine.status === 'online')
              .map((machine) => machine.id)
          : [scopeMachine]
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
      const inactive = pages
        .flatMap((page) => page.sessions)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, limit)
      const inactiveTotal = pages.reduce((sum, page) => sum + page.total, 0)
      const state = getState()
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
  }, [inactiveOpen, scopeMachine, scopeProject, inactiveVersion, limit])
}
