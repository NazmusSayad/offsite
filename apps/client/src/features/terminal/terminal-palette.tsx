import { SearchIcon, SquareTerminalIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { NO_PROJECT } from '@offsite/core/projects'
import { GLOBAL_TERMINALS } from '@offsite/core/terminal'
import {
  type ReactNode,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { homePath, rankProjects, withWorktrees } from '@/api/projects'
import { ProjectIcon } from '@/components/icons'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { MachineLogo } from '@/constants/machine-icons'
import { useStore } from '@/lib/store'
import { useTerminalPage, useTerminalView } from '@/lib/url'
import { cn } from '@/lib/utils'
import { groupName } from './groups'
import { createTab } from './page'
import {
  getState,
  machineTabAlerted,
  machineTabTitle,
  showTab,
  subscribe,
} from './session'

type Item = {
  key: string
  section: string
  label: string
  detail: string
  machine: string
  icon: ReactNode
  nested: boolean
  alert: boolean
  run: () => void
}

export function TerminalPalette() {
  const [open, setOpen] = useState(false)
  useHotkeys('mod+t', () => setOpen(!open), {
    enableOnFormTags: true,
    enableOnContentEditable: true,
    preventDefault: true,
  })
  useHotkeys(
    ['mod+shift+backquote', 'mod+shift+t'],
    (event) => {
      event.stopPropagation()
      setOpen(!open)
    },
    {
      enableOnFormTags: true,
      enableOnContentEditable: true,
      preventDefault: true,
      eventListenerOptions: { capture: true },
    }
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        showCloseButton={false}
        className="top-[20%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl"
      >
        <DialogTitle className="sr-only">Terminals</DialogTitle>
        <TerminalPaletteContent onClose={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  )
}

function TerminalPaletteContent(props: { onClose: () => void }) {
  useSyncExternalStore(subscribe, getState)
  const machines = useStore((state) => state.machines)
  const projects = useStore((state) => state.projects)
  const selection = useStore((state) => state.selection)
  const page = useTerminalPage()
  const view = useTerminalView()
  const [query, setQuery] = useState('')
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const list = useRef<HTMLDivElement>(null)
  const online = machines.filter((machine) => machine.status === 'online')
  const search = query.trim().toLowerCase()

  function projectOf(machine: string, projectId: string) {
    return projects.find(
      (project) => project.machine === machine && project.id === projectId
    )
  }

  function placeName(machine: string, projectId: string) {
    if (projectId === GLOBAL_TERMINALS) {
      return machines.find((item) => item.id === machine)?.name ?? ''
    }
    return groupName(projectOf(machine, projectId))
  }

  function machineName(machine: string) {
    return online.length > 1
      ? (machines.find((item) => item.id === machine)?.name ?? '')
      : ''
  }

  const here =
    page !== null
      ? { machine: page, projectId: view }
      : selection !== null &&
          selection.projectId !== NO_PROJECT &&
          projectOf(selection.machine, selection.projectId)?.scratch !== true &&
          online.some((machine) => machine.id === selection.machine)
        ? { machine: selection.machine, projectId: selection.projectId }
        : null
  const tree = online.length > 1
  const creating = [...online]
    .sort(
      (a, b) => Number(b.id === here?.machine) - Number(a.id === here?.machine)
    )
    .map((machine) => {
      const own = projects.filter(
        (project) => project.machine === machine.id && !project.scratch
      )
      const shown =
        search === ''
          ? rankProjects(
              own.filter(
                (project) => !project.hidden && project.parentId === null
              )
            ).top
          : withWorktrees(own)
      const home = machine.system?.homeDir
      const workingDir =
        machine.system === null
          ? '~'
          : (machine.config?.workingDir[machine.system.platform] ?? '~')
      return [
        ...(here?.machine === machine.id ? [here.projectId] : []),
        GLOBAL_TERMINALS,
        ...shown.map((project) => project.id),
      ]
        .filter((id, index, all) => all.indexOf(id) === index)
        .sort(
          (a, b) =>
            Number(tree && b === GLOBAL_TERMINALS) -
            Number(tree && a === GLOBAL_TERMINALS)
        )
        .map((projectId): Item => {
          const project = projectOf(machine.id, projectId)
          const dir =
            projectId === GLOBAL_TERMINALS ? workingDir : (project?.path ?? '')
          const shortDir = home === undefined ? dir : homePath(dir, home)
          return {
            key: `new:${machine.id}:${projectId}`,
            section: 'New terminal',
            label:
              projectId !== GLOBAL_TERMINALS
                ? groupName(project)
                : tree
                  ? machine.name
                  : shortDir,
            detail: projectId === GLOBAL_TERMINALS && !tree ? '' : shortDir,
            machine: machine.name,
            icon:
              projectId === GLOBAL_TERMINALS ? (
                <MachineLogo icon={machine.icon} className="size-4 shrink-0" />
              ) : (
                <ProjectIcon
                  machine={machine.id}
                  projectId={projectId}
                  className="size-4 shrink-0"
                />
              ),
            nested: tree && projectId !== GLOBAL_TERMINALS,
            alert: false,
            run: () =>
              void createTab(
                machine.id,
                projectId === GLOBAL_TERMINALS ? null : projectId
              ),
          }
        })
    })
  const open = online.flatMap((machine) =>
    machine.terminals.map((tab) => {
      const projectId = tab.projectId ?? GLOBAL_TERMINALS
      const place = placeName(machine.id, projectId)
      const other =
        projectId === GLOBAL_TERMINALS ? '' : machineName(machine.id)
      return {
        key: `tab:${machine.id}:${tab.id}`,
        section: 'Open',
        label: machineTabTitle(machine.id, tab),
        detail: other === '' ? place : `${place} · ${other}`,
        machine: machine.name,
        icon: (
          <HugeiconsIcon
            icon={SquareTerminalIcon}
            className="text-muted-foreground size-4 shrink-0"
          />
        ),
        nested: false,
        alert: machineTabAlerted(machine.id, tab.id),
        run: () => showTab(machine.id, projectId, tab.id),
      }
    })
  )
  const items = [
    ...open.filter(matches),
    ...creating.flatMap(([head, ...rest]) => {
      if (!tree) {
        return [head, ...rest].filter(matches)
      }
      const shown = rest.filter(matches)
      return matches(head) || shown.length > 0 ? [head, ...shown] : []
    }),
  ]
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

  function matches(item: Item) {
    return `${item.label} ${item.detail} ${item.machine}`
      .toLowerCase()
      .includes(search)
  }

  function pick(item: Item) {
    props.onClose()
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
            setActiveKey(null)
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              const step = event.key === 'ArrowDown' ? 1 : -1
              if (items.length > 0) {
                setActiveKey(
                  items[(activeIndex + step + items.length) % items.length].key
                )
              }
            }
            if (event.key === 'Enter' && activeIndex >= 0) {
              event.preventDefault()
              pick(items[activeIndex])
            }
          }}
          placeholder="Search terminals…"
          className="placeholder:text-placeholder/75 h-11 w-full bg-transparent text-sm outline-none"
        />
      </label>
      <div ref={list} className="max-h-96 overflow-y-auto p-1">
        {items.length === 0 && (
          <p className="text-muted-foreground px-3 py-6 text-center text-xs">
            {online.length === 0 ? 'No machine is online.' : 'Nothing matches.'}
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
                'flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left',
                item.nested && 'pl-9',
                index === activeIndex && 'bg-accent'
              )}
              onMouseMove={() => setActiveKey(item.key)}
              onClick={() => pick(item)}
            >
              {item.icon}
              <span className="min-w-0 flex-1 truncate text-sm">
                {item.label}
              </span>
              {item.alert && (
                <span className="text-info shrink-0 text-xs">Needs you</span>
              )}
              {item.detail !== '' && (
                <span className="text-secondary-label max-w-[45%] shrink-0 truncate text-xs">
                  {item.detail}
                </span>
              )}
            </button>
          </div>
        ))}
      </div>
    </>
  )
}
