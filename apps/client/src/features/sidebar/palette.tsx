import { SearchIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { Provider } from '@offsite/core/providers'
import {
  matchAction,
  type MessageMatch,
  rankMessages,
  rankThreads,
  recentUse,
  type SearchSession,
  type ThreadSubject,
} from '@offsite/core/search'
import {
  hasSearchableWord,
  messageRanges,
  type SearchRange,
} from '@offsite/core/search-match'
import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useDebounceValue } from 'usehooks-ts'
import { call } from '@/api/connection'
import { machineKey } from '@/api/machines'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { providerNames } from '@/lib/format'
import { openSession } from '@/lib/sessions'
import {
  getState,
  providerPages,
  showPalette,
  showSettings,
  showSettingsPage,
  useStore,
} from '@/lib/store'
import { cn } from '@/lib/utils'

type Item = {
  key: string
  section: string
  label: string
  labelRanges: SearchRange[]
  detail: string
  detailRanges: SearchRange[]
  run: () => void
}

type MachineSearchSession = SearchSession & { machine: string }

type MachineMessageMatch = MessageMatch & { machine: string }

const THREAD_LIMIT = 20
const RECENT_LIMIT = 12
const MESSAGE_LIMIT = 10

export function Palette() {
  const open = useStore((state) => state.paletteOpen)

  return (
    <Dialog open={open} onOpenChange={showPalette}>
      <DialogContent
        showCloseButton={false}
        className="top-[20%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl"
      >
        <DialogTitle className="sr-only">Search threads</DialogTitle>
        <PaletteContent />
      </DialogContent>
    </Dialog>
  )
}

function PaletteContent() {
  const selection = useStore((state) => state.selection)
  const machines = useStore((state) => state.machines)
  const projects = useStore((state) => state.projects)
  const [query, setQuery] = useState('')
  const [search] = useDebounceValue(query, 300)
  const [threads, setThreads] = useState<MachineSearchSession[]>([])
  const [threadFailures, setThreadFailures] = useState<string[]>([])
  const [messages, setMessages] = useState<MachineMessageMatch[]>([])
  const [messageFailures, setMessageFailures] = useState<string[]>([])
  const [searched, setSearched] = useState('')
  const [active, setActive] = useState(0)
  const [now] = useState(() => Date.now())
  const list = useRef<HTMLDivElement>(null)
  const actionsOnly = query.startsWith('>')
  const text = actionsOnly ? query.slice(1) : query
  const searchesMessages = !actionsOnly && hasSearchableWord(query)

  useEffect(() => {
    let current = true
    for (const machine of getState().machines.filter(
      (item) => item.status === 'online'
    )) {
      call(machine.id, 'sessions.searchable', undefined)
        .then((result) => {
          if (!current) {
            return
          }
          setThreads((previous) => [
            ...previous,
            ...result.sessions.map((session) => ({
              ...session,
              machine: machine.id,
            })),
          ])
          setThreadFailures((previous) => [
            ...previous,
            ...providerFailures(result.failed),
          ])
        })
        .catch(() => {
          if (current) {
            setThreadFailures((previous) => [...previous, machine.name])
          }
        })
    }
    return () => {
      current = false
    }
  }, [])

  useEffect(() => {
    if (search.startsWith('>') || !hasSearchableWord(search)) {
      return
    }
    let current = true
    const online = getState().machines.filter(
      (item) => item.status === 'online'
    )
    const matches: MachineMessageMatch[] = []
    const failures: string[] = []
    let waiting = online.length
    for (const machine of online) {
      call(machine.id, 'sessions.searchMessages', { query: search })
        .then((result) => {
          matches.push(
            ...result.matches.map((match) => ({
              ...match,
              machine: machine.id,
            }))
          )
          failures.push(...providerFailures(result.failed))
        })
        .catch(() => failures.push(machine.name))
        .finally(() => {
          if (!current) {
            return
          }
          waiting -= 1
          setMessages([...matches])
          setMessageFailures([...failures])
          if (waiting === 0) {
            setSearched(search)
          }
        })
    }
    return () => {
      current = false
    }
  }, [search])

  const entries = useMemo(
    () =>
      threads.map((thread) => ({
        thread,
        subject: threadSubject(thread, machines, projects),
      })),
    [threads, machines, projects]
  )
  const subjects = new Map(
    entries.map((entry) => [
      machineKey(entry.thread.machine, entry.thread.id),
      entry.subject,
    ])
  )
  const rankedThreads = useMemo(
    () =>
      text.trim() === ''
        ? []
        : rankThreads(entries, (entry) => entry.subject, text, now)
            .slice(0, THREAD_LIMIT)
            .map((entry) => ({
              item: entry.item.thread,
              ranges: entry.ranges,
            })),
    [entries, text, now]
  )
  const recentThreads = useMemo(
    () =>
      [...entries]
        .sort((a, b) => recentUse(b.subject) - recentUse(a.subject))
        .slice(0, RECENT_LIMIT)
        .map((entry) => ({ item: entry.thread, ranges: [] })),
    [entries]
  )
  const shownThreads = text.trim() === '' ? recentThreads : rankedThreads

  const actions = [
    ...(selection === null
      ? []
      : [
          {
            key: 'new',
            label: 'New thread',
            detail:
              projects.find(
                (project) =>
                  project.machine === selection.machine &&
                  project.id === selection.projectId
              )?.path ?? '',
            run: () => openSession({ ...selection, sessionId: null }),
          },
        ]),
    {
      key: 'accounts',
      label: 'Manage accounts',
      detail: '',
      run: () => showSettingsPage(providerPages[getState().settings.provider]),
    },
    {
      key: 'settings',
      label: 'Settings',
      detail: 'Theme, notifications, keyboard shortcuts',
      run: () => showSettings(true),
    },
  ]
  const actionItems: Item[] = actions.flatMap((action) => {
    const base = {
      ...action,
      section: 'Actions',
      labelRanges: [],
      detailRanges: [],
    }
    if (text.trim() === '') {
      return [base]
    }
    const match = matchAction(text, action.label, action.detail)
    return match === null ? [] : [{ ...base, labelRanges: match.ranges }]
  })

  const shownKeys = new Set(
    rankedThreads.map((entry) => machineKey(entry.item.machine, entry.item.id))
  )
  const threadItems: Item[] = actionsOnly
    ? []
    : shownThreads.map((entry) => {
        const session = entry.item
        const branch =
          text.trim() !== '' && session.branch !== null
            ? ` · ${session.branch}`
            : ''
        return {
          key: machineKey(session.machine, session.id),
          section: text.trim() === '' ? 'Recent' : 'Threads',
          label: session.title,
          labelRanges: entry.ranges,
          detail: `${threadDetail(session, machines, projects)}${branch}`,
          detailRanges: [],
          run: () =>
            openSession(
              {
                machine: session.machine,
                projectId: session.projectId,
                sessionId: session.id,
              },
              text.trim() === '' ? null : text
            ),
        }
      })
  const messageItems: Item[] = !searchesMessages
    ? []
    : rankMessages(
        messages.filter(
          (match) => !shownKeys.has(machineKey(match.machine, match.sessionId))
        ),
        (match) => subjects.get(machineKey(match.machine, match.sessionId)),
        text,
        now
      )
        .slice(0, MESSAGE_LIMIT)
        .flatMap((match) => {
          const session = threads.find(
            (item) =>
              item.machine === match.machine && item.id === match.sessionId
          )
          if (session === undefined) {
            return []
          }
          const detail = `${match.author === 'user' ? 'You: ' : ''}${match.snippet}`
          return [
            {
              key: `message:${machineKey(match.machine, match.sessionId)}`,
              section: 'In messages',
              label: session.title,
              labelRanges: [],
              detail,
              detailRanges: messageRanges(text, detail),
              run: () =>
                openSession(
                  {
                    machine: session.machine,
                    projectId: session.projectId,
                    sessionId: session.id,
                  },
                  text
                ),
            },
          ]
        })
  const items = [...actionItems, ...threadItems, ...messageItems]
  const activeIndex = Math.min(active, items.length - 1)
  const failures = [
    ...new Set([
      ...threadFailures,
      ...(searchesMessages ? messageFailures : []),
    ]),
  ]
  const searching = searchesMessages && searched !== query

  useLayoutEffect(() => {
    list.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  function pick(item: Item) {
    showPalette(false)
    item.run()
  }

  return (
    <>
      <label className="flex items-center gap-2 border-b px-4">
        <HugeiconsIcon
          icon={SearchIcon}
          className="text-muted-foreground size-4 shrink-0"
        />
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setActive(0)
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              const step = event.key === 'ArrowDown' ? 1 : -1
              setActive((activeIndex + step + items.length) % items.length)
            }
            if (event.key === 'Enter' && activeIndex >= 0) {
              event.preventDefault()
              pick(items[activeIndex])
            }
          }}
          placeholder="Search threads and actions…"
          className="placeholder:text-placeholder/75 h-11 w-full bg-transparent text-sm outline-none"
        />
      </label>
      <div ref={list} className="max-h-96 overflow-y-auto p-1">
        {items.length === 0 && !searching && (
          <p className="text-muted-foreground px-3 py-6 text-center text-xs">
            Nothing matches.
          </p>
        )}
        {items.map((item, index) => (
          <div key={item.key}>
            {item.section !== items[index - 1]?.section && (
              <p className="text-secondary-label px-2.5 pt-2 pb-1 text-xs">
                {item.section}
              </p>
            )}
            <button
              data-active={index === activeIndex}
              className={cn(
                'flex w-full cursor-pointer flex-col rounded-lg px-2.5 py-1.5 text-left',
                index === activeIndex && 'bg-accent'
              )}
              onMouseMove={() => setActive(index)}
              onClick={() => pick(item)}
            >
              <span className="truncate text-sm">
                <Highlighted text={item.label} ranges={item.labelRanges} />
              </span>
              {item.detail !== '' && (
                <span className="text-secondary-label truncate text-xs">
                  <Highlighted text={item.detail} ranges={item.detailRanges} />
                </span>
              )}
            </button>
          </div>
        ))}
        {searching && (
          <p className="text-muted-foreground px-2.5 py-2 text-xs">
            Searching messages…
          </p>
        )}
      </div>
      {failures.length > 0 && (
        <p className="text-muted-foreground border-t px-4 py-2 text-xs">
          Couldn&apos;t search {failures.join(', ')}
        </p>
      )}
    </>
  )
}

function Highlighted(props: { text: string; ranges: SearchRange[] }) {
  return (
    <>
      {props.ranges.map((range, index) => (
        <Fragment key={range.start}>
          {props.text.slice(props.ranges[index - 1]?.end ?? 0, range.start)}
          <mark className="text-foreground bg-transparent font-medium">
            {props.text.slice(range.start, range.end)}
          </mark>
        </Fragment>
      ))}
      {props.text.slice(props.ranges.at(-1)?.end ?? 0)}
    </>
  )
}

function providerFailures(failed: Provider[]) {
  return failed.map((provider) => providerNames[provider])
}

function threadSubject(
  thread: MachineSearchSession,
  machines: { id: string; name: string }[],
  projects: { machine: string; id: string; name: string }[]
): ThreadSubject {
  return {
    id: thread.id,
    title: thread.title,
    branch: thread.branch,
    projectName:
      projects.find(
        (project) =>
          project.machine === thread.machine && project.id === thread.projectId
      )?.name ?? null,
    machineName:
      machines.length > 1
        ? (machines.find((item) => item.id === thread.machine)?.name ?? null)
        : null,
    updatedAt: thread.updatedAt,
    opens: thread.opens,
  }
}

function threadDetail(
  thread: MachineSearchSession,
  machines: { id: string; name: string }[],
  projects: { machine: string; id: string; path: string }[]
) {
  const minimized = thread.status === 'minimized' ? 'Minimized · ' : ''
  const machine =
    machines.length > 1
      ? `${machines.find((item) => item.id === thread.machine)?.name ?? ''}:`
      : ''
  const folder =
    projects.find(
      (project) =>
        project.machine === thread.machine && project.id === thread.projectId
    )?.path ?? ''
  return `${minimized}${machine}${folder}`
}
