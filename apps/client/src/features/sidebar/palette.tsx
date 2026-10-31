import { ChevronDownIcon, SearchIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  matchAction,
  rankMessages,
  rankThreads,
  recentUse,
  type ThreadSubject,
} from '@offsite/core/search'
import { messageRanges, type SearchRange } from '@offsite/core/search-match'
import { Fragment, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useDebounceValue } from 'usehooks-ts'
import { machineKey } from '@/api/machines'
import { ProjectIcon } from '@/components/icons'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MachineLogo } from '@/constants/machine-icons'
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
import { type MachineSearchSession, usePaletteResults } from './palette-results'

type Item = {
  key: string
  section: string
  label: string
  labelRanges: SearchRange[]
  detail: string
  detailRanges: SearchRange[]
  place: { machine: string; projectId: string } | null
  run: () => void
}

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
  const [scope, setScope] = useState('all')
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [now] = useState(() => Date.now())
  const list = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const actionsOnly = query.startsWith('>')
  const text = actionsOnly ? query.slice(1) : query
  const results = usePaletteResults(query, search, scope)
  const threadResults = results.threadResults
  const reachable = results.reachable
  const picked = machines.find((item) => item.id === scope)

  const entries = useMemo(
    () =>
      threadResults
        .filter((result) => reachable.split(' ').includes(result.machine))
        .flatMap((result) => result.sessions)
        .map((thread) => ({
          thread,
          subject: threadSubject(thread, machines, projects),
        })),
    [threadResults, reachable, machines, projects]
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
            place: {
              machine: selection.machine,
              projectId: selection.projectId,
            },
            detail: projectName(
              selection.machine,
              selection.projectId,
              projects
            ),
            run: () => openSession({ ...selection, sessionId: null }),
          },
        ]),
    {
      key: 'accounts',
      label: 'Manage accounts',
      detail: '',
      place: null,
      run: () => showSettingsPage(providerPages[getState().settings.provider]),
    },
    {
      key: 'settings',
      label: 'Settings',
      detail: 'Theme, notifications, keyboard shortcuts',
      place: null,
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
            ? ` | ${session.branch}`
            : ''
        return {
          key: machineKey(session.machine, session.id),
          section: text.trim() === '' ? 'Recent' : 'Threads',
          label: session.title,
          labelRanges: entry.ranges,
          detail: `${threadDetail(session, projects)}${branch}`,
          detailRanges: [],
          place: { machine: session.machine, projectId: session.projectId },
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
  const messageItems: Item[] = actionsOnly
    ? []
    : rankMessages(
        results.messages.filter(
          (match) => !shownKeys.has(machineKey(match.machine, match.sessionId))
        ),
        (match) => subjects.get(machineKey(match.machine, match.sessionId)),
        text,
        now
      )
        .slice(0, MESSAGE_LIMIT)
        .flatMap((match) => {
          const session = entries.find(
            (entry) =>
              entry.thread.machine === match.machine &&
              entry.thread.id === match.sessionId
          )?.thread
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
              place: {
                machine: session.machine,
                projectId: session.projectId,
              },
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
  const activeIndex = Math.min(
    Math.max(
      0,
      items.findIndex((item) => item.key === activeKey)
    ),
    items.length - 1
  )

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
      <div className="flex items-center gap-2 border-b pr-2.5">
        <label className="flex min-w-0 flex-1 items-center gap-2 pl-4">
          <HugeiconsIcon
            icon={SearchIcon}
            className="text-muted-foreground size-4 shrink-0"
          />
          <input
            ref={input}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setActiveKey(null)
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault()
                const step = event.key === 'ArrowDown' ? 1 : -1
                if (items.length > 0) {
                  setActiveKey(
                    items[(activeIndex + step + items.length) % items.length]
                      .key
                  )
                }
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
        {machines.length > 1 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="text-secondary-label hover:bg-accent data-[state=open]:bg-accent flex h-7 max-w-40 shrink-0 cursor-pointer items-center gap-1.5 rounded-[var(--control-radius)] px-1.5 text-xs">
                {picked !== undefined && (
                  <MachineLogo icon={picked.icon} className="size-3 shrink-0" />
                )}
                <span className="truncate">
                  {picked?.name ?? 'All machines'}
                </span>
                <HugeiconsIcon
                  icon={ChevronDownIcon}
                  className="size-3 shrink-0"
                />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-56"
              onCloseAutoFocus={(event) => {
                event.preventDefault()
                input.current?.focus()
              }}
            >
              <DropdownMenuRadioGroup
                value={scope}
                onValueChange={(value) => {
                  setScope(value)
                  setActiveKey(null)
                }}
              >
                <DropdownMenuRadioItem value="all">
                  All machines
                </DropdownMenuRadioItem>
                {machines.map((machine) => (
                  <DropdownMenuRadioItem
                    key={machine.id}
                    value={machine.id}
                    disabled={machine.status !== 'online'}
                  >
                    <MachineLogo
                      icon={machine.icon}
                      className="size-3.5 shrink-0"
                    />
                    <span className="min-w-0 truncate">
                      {machineLabel(machine)}
                    </span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <div ref={list} className="max-h-96 overflow-y-auto p-1">
        {items.length === 0 && !results.searching && (
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
              onMouseMove={() => setActiveKey(item.key)}
              onClick={() => pick(item)}
            >
              <span className="flex min-w-0 items-center gap-2 text-sm">
                {item.place !== null && (
                  <ProjectIcon
                    machine={item.place.machine}
                    projectId={item.place.projectId}
                    className="size-3.5 shrink-0 grayscale"
                  />
                )}
                <span className="min-w-0 truncate">
                  <Highlighted text={item.label} ranges={item.labelRanges} />
                </span>
              </span>
              {item.detail !== '' && (
                <span className="text-secondary-label flex min-w-0 items-center gap-1.5 text-xs">
                  {item.place !== null && machines.length > 1 && (
                    <MachineTag id={item.place.machine} machines={machines} />
                  )}
                  <span className="min-w-0 truncate">
                    <Highlighted
                      text={item.detail}
                      ranges={item.detailRanges}
                    />
                  </span>
                </span>
              )}
            </button>
          </div>
        ))}
        {results.searching && (
          <p className="text-muted-foreground px-2.5 py-2 text-xs">
            Searching messages…
          </p>
        )}
      </div>
      {results.failures.length > 0 && (
        <p className="text-muted-foreground border-t px-4 py-2 text-xs">
          Couldn&apos;t search {results.failures.join(', ')}
        </p>
      )}
    </>
  )
}

function MachineTag(props: {
  id: string
  machines: { id: string; name: string; icon: string | null }[]
}) {
  const machine = props.machines.find((item) => item.id === props.id)
  return (
    <>
      <MachineLogo icon={machine?.icon ?? null} className="size-3 shrink-0" />
      <span className="shrink-0">{machine?.name} ·</span>
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

function machineLabel(machine: { name: string; status: string }) {
  if (machine.status === 'online') {
    return machine.name
  }
  if (machine.status === 'unpaired') {
    return `${machine.name} · needs pairing`
  }
  return `${machine.name} · offline`
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
  projects: { machine: string; id: string; name: string }[]
) {
  const minimized = thread.status === 'minimized' ? 'Minimized · ' : ''
  return `${minimized}${projectName(thread.machine, thread.projectId, projects)}`
}

function projectName(
  machine: string,
  projectId: string,
  projects: { machine: string; id: string; name: string }[]
) {
  return (
    projects.find((item) => item.machine === machine && item.id === projectId)
      ?.name ?? ''
  )
}
