import { useEffect } from 'react'
import { call } from '@/api/connection'
import { getState, showError, update, useStore } from '@/lib/store'

export function useInactiveSessions(
  inactiveOpen: boolean,
  scopeMachine: string | null,
  scopeProject: string | null
) {
  const inactiveVersion = useStore((state) => state.inactiveVersion)

  useEffect(() => {
    if (!inactiveOpen) {
      return
    }
    let current = true
    let latest = 0
    async function load() {
      const request = ++latest
      const targets =
        scopeMachine === null
          ? getState()
              .machines.filter((machine) => machine.status === 'online')
              .map((machine) => machine.id)
          : [scopeMachine]
      const lists = await Promise.all(
        targets.map(async (machine) =>
          (
            await call(machine, 'sessions.inactive', {
              projectId: scopeProject,
            })
          ).map((session) => ({ ...session, machine }))
        )
      )
      if (current && request === latest) {
        update({
          inactive: lists.flat().sort((a, b) => b.updatedAt - a.updatedAt),
        })
      }
    }
    function reload() {
      if (document.visibilityState === 'visible') {
        load().catch(showError)
      }
    }
    load().catch(showError)
    window.addEventListener('focus', reload)
    document.addEventListener('visibilitychange', reload)
    return () => {
      current = false
      window.removeEventListener('focus', reload)
      document.removeEventListener('visibilitychange', reload)
    }
  }, [inactiveOpen, scopeMachine, scopeProject, inactiveVersion])
}
