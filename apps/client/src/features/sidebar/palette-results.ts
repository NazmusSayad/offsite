import type { Provider } from '@offsite/core/providers'
import type { MessageMatch, SearchSession } from '@offsite/core/search'
import { hasSearchableWord } from '@offsite/core/search-match'
import { useEffect, useState } from 'react'
import { call } from '@/api/connection'
import { providerNames } from '@/lib/format'
import { getState, useStore } from '@/lib/store'

export type MachineSearchSession = SearchSession & { machine: string }

type MachineMessageMatch = MessageMatch & { machine: string }

type ThreadResult = {
  machine: string
  sessions: MachineSearchSession[]
  failed: string[]
}

type MessageResult = {
  machine: string
  query: string
  matches: MachineMessageMatch[]
  failed: string[]
}

export function usePaletteResults(
  query: string,
  search: string,
  scope: string
) {
  const machines = useStore((state) => state.machines)
  const [threadResults, setThreadResults] = useState<ThreadResult[]>([])
  const [messageResults, setMessageResults] = useState<MessageResult[]>([])
  const online = machines
    .filter((item) => item.status === 'online')
    .map((item) => item.id)
    .join(' ')
  const inScope = machines.filter(
    (item) => scope === 'all' || item.id === scope
  )
  const reachable = inScope
    .filter((item) => item.status === 'online')
    .map((item) => item.id)
    .join(' ')

  useEffect(() => {
    let current = true
    for (const machine of getState().machines.filter(
      (item) => item.status === 'online'
    )) {
      call(machine.id, 'sessions.searchable', undefined)
        .then((result) => {
          if (current) {
            setThreadResults((previous) =>
              withResult(previous, {
                machine: machine.id,
                sessions: result.sessions.map((session) => ({
                  ...session,
                  machine: machine.id,
                })),
                failed: providerFailures(result.failed),
              })
            )
          }
        })
        .catch(() => {
          if (current) {
            setThreadResults((previous) =>
              withResult(previous, {
                machine: machine.id,
                sessions: [],
                failed: [machine.name],
              })
            )
          }
        })
    }
    return () => {
      current = false
    }
  }, [online])

  useEffect(() => {
    if (search.startsWith('>') || !hasSearchableWord(search)) {
      return
    }
    let current = true
    for (const machine of getState().machines.filter(
      (item) => item.status === 'online'
    )) {
      call(machine.id, 'sessions.searchMessages', { query: search })
        .then((result) => {
          if (current) {
            setMessageResults((previous) =>
              withResult(previous, {
                machine: machine.id,
                query: search,
                matches: result.matches.map((match) => ({
                  ...match,
                  machine: machine.id,
                })),
                failed: providerFailures(result.failed),
              })
            )
          }
        })
        .catch(() => {
          if (current) {
            setMessageResults((previous) =>
              withResult(previous, {
                machine: machine.id,
                query: search,
                matches: [],
                failed: [machine.name],
              })
            )
          }
        })
    }
    return () => {
      current = false
    }
  }, [search, online])

  const finished = messageResults.filter(
    (result) =>
      reachable.split(' ').includes(result.machine) && result.query === query
  )

  return {
    threadResults,
    reachable,
    messages: finished.flatMap((result) => result.matches),
    searching:
      !query.startsWith('>') &&
      hasSearchableWord(query) &&
      inScope.some(
        (item) =>
          item.status === 'online' &&
          !finished.some((result) => result.machine === item.id)
      ),
    failures: [
      ...new Set([
        ...inScope
          .filter((item) => item.status !== 'online')
          .map((item) => item.name),
        ...threadResults
          .filter((result) => reachable.split(' ').includes(result.machine))
          .flatMap((result) => result.failed),
        ...finished.flatMap((result) => result.failed),
      ]),
    ],
  }
}

function withResult<T extends { machine: string }>(results: T[], next: T) {
  return [...results.filter((item) => item.machine !== next.machine), next]
}

function providerFailures(failed: Provider[]) {
  return failed.map((provider) => providerNames[provider])
}
