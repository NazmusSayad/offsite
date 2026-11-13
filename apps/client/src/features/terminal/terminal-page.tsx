import {
  Add01Icon,
  ArrowDown01Icon,
  Delete02Icon,
  GitBranchIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { GLOBAL_TERMINALS } from '@offsite/core/terminal'
import {
  Fragment,
  type ReactNode,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import {
  rankProjects,
  withWorktrees,
  worktreeBranch,
  homePath,
} from '@/api/projects'
import { ProjectIcon } from '@/components/icons'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { MachineLogo } from '@/constants/machine-icons'
import { type Machine, type MachineProject, useStore } from '@/lib/store'
import { useTerminalPage, useTerminalView } from '@/lib/url'
import { cn, touch } from '@/lib/utils'
import { closeTabs } from './close-tab'
import { useHoverMenu } from './hover-menu'
import { MoreTerminalProjects } from './new-terminal-button'
import { createTab, showGroup } from './page'
import { TerminalPanel } from './panel'
import { getState, subscribe, tabView } from './session'

type Group = {
  machine: Machine
  view: string
  name: string
  count: number
  parentId: string | null
}

export function TerminalPage(
  props:
    | { machine: string; mobile: true; leading: ReactNode }
    | { machine: string; mobile: false }
) {
  useSyncExternalStore(subscribe, getState)
  const [groupsOpen, setGroupsOpen] = useState(false)
  const view = useTerminalView()
  const groups = useGroups()
  const current = groups.find(
    (group) => group.machine.id === props.machine && group.view === view
  )

  useEffect(() => {
    localStorage.setItem('lastTerminal', props.machine)
    localStorage.setItem('lastTerminalView', view)
  }, [props.machine, view])

  if (props.mobile) {
    return (
      <main className="bg-background flex min-w-0 flex-1 flex-col overflow-hidden pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
        <div className="min-h-0 flex-1">
          <TerminalPanel
            view={view}
            page
            mobile
            leading={
              <>
                <div className="flex min-w-0 flex-1 items-center self-stretch">
                  {props.leading}
                  <Popover open={groupsOpen} onOpenChange={setGroupsOpen}>
                    <PopoverTrigger asChild>
                      <button className="text-muted-foreground hover:text-foreground flex min-w-0 flex-1 items-center gap-1.5 self-stretch px-2 text-[13px]">
                        {current !== undefined && <GroupIcon group={current} />}
                        <span className="truncate">{current?.name}</span>
                        <HugeiconsIcon
                          icon={ArrowDown01Icon}
                          className="size-3.5 flex-none"
                        />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="start"
                      className="w-64 p-1"
                      onClick={() => setGroupsOpen(false)}
                    >
                      <TerminalGroups />
                    </PopoverContent>
                  </Popover>
                </div>
                <span className="bg-border h-4 w-px flex-none" />
              </>
            }
          />
        </div>
      </main>
    )
  }

  return (
    <main className="bg-background flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1">
        <TerminalPanel view={view} page tabSize="lg" />
      </div>
    </main>
  )
}

export function TerminalGroups() {
  useSyncExternalStore(subscribe, getState)
  const groups = useGroups().filter(
    (group) => group.machine.status === 'online'
  )
  const rows = groups.filter((group) => group.parentId === null)

  if (groups.length === 0) {
    return null
  }

  return (
    <div className="flex max-h-[calc(var(--radix-popover-content-available-height)-0.5rem)] flex-col gap-px overflow-y-auto">
      {rows.map((group, index) => (
        <Fragment key={`${group.machine.id}:${group.view}`}>
          <GroupRow
            group={group}
            worktrees={groups.filter(
              (item) =>
                item.machine.id === group.machine.id &&
                item.parentId === group.view
            )}
          />
          {rows[index + 1]?.machine.id !== group.machine.id && (
            <MoreTerminalProjects machine={group.machine.id} />
          )}
        </Fragment>
      ))}
    </div>
  )
}

function GroupRow(props: { group: Group; worktrees: Group[] }) {
  const page = useTerminalPage()
  const view = useTerminalView()
  const hover = useHoverMenu()
  const group = props.group
  const family = [group, ...props.worktrees]
  const count = family.reduce((sum, item) => sum + item.count, 0)
  const button = (
    <button
      className={cn(
        'flex h-7 w-full cursor-pointer items-center gap-2 rounded-sm pr-2.5 pl-2 text-left text-[13px]',
        group.view !== GLOBAL_TERMINALS && 'pl-6'
      )}
      onClick={(event) => {
        if (props.worktrees.length > 0 && touch.matches) {
          event.stopPropagation()
          return
        }
        if (group.count === 0) {
          void createTab(
            group.machine.id,
            group.view === GLOBAL_TERMINALS ? null : group.view
          )
          return
        }
        showGroup(group.machine.id, group.view)
      }}
    >
      <GroupIcon group={group} />
      <span className="truncate">{group.name}</span>
      {props.worktrees.length > 0 && (
        <span
          className="text-muted-foreground flex shrink-0 items-center gap-0.5 text-xs tabular-nums"
          title={`${props.worktrees.length} worktrees`}
        >
          <HugeiconsIcon icon={GitBranchIcon} className="size-3.5" />
          {props.worktrees.length}
        </span>
      )}
      <GroupCount
        count={count}
        alert={family.some((item) => alerted(item, page))}
        className="group-hover/row:invisible pointer-coarse:mr-7"
      />
    </button>
  )

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            'group/row text-popover-foreground hover:bg-accent hover:text-accent-foreground data-[state=open]:bg-accent has-[[data-state=open]]:bg-accent has-[[data-state=open]]:text-accent-foreground relative shrink-0 rounded-sm',
            group.machine.id === page &&
              family.some((item) => item.view === view) &&
              'bg-accent/50 text-accent-foreground'
          )}
          {...(props.worktrees.length > 0 ? hover.area : {})}
        >
          {props.worktrees.length > 0 ? (
            <DropdownMenu {...hover.root}>
              <DropdownMenuTrigger asChild {...hover.trigger}>
                {button}
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                side={touch.matches ? 'bottom' : 'right'}
                className="max-h-80 max-w-96 min-w-56 overflow-y-auto"
                onCloseAutoFocus={(event) => event.preventDefault()}
                {...hover.area}
              >
                <WorktreeGroups
                  machine={group.machine.id}
                  rootId={group.view}
                />
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            button
          )}
          <button
            className="text-muted-foreground hover:text-foreground absolute top-0.5 right-1.5 grid size-6 cursor-pointer place-items-center rounded-md opacity-0 transition-opacity group-hover/row:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
            aria-label="New terminal"
            title="New terminal"
            onClick={() =>
              void createTab(
                group.machine.id,
                group.view === GLOBAL_TERMINALS ? null : group.view
              )
            }
          >
            <HugeiconsIcon icon={Add01Icon} className="size-4" />
          </button>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent onCloseAutoFocus={(event) => event.preventDefault()}>
        <ContextMenuItem
          onSelect={() =>
            void createTab(
              group.machine.id,
              group.view === GLOBAL_TERMINALS ? null : group.view
            )
          }
        >
          <HugeiconsIcon icon={Add01Icon} />
          New terminal
        </ContextMenuItem>
        {group.view === GLOBAL_TERMINALS && (
          <ContextMenuItem
            variant="destructive"
            onSelect={() =>
              void closeTabs(
                group.machine.terminals.map((tab) => ({
                  machine: group.machine.id,
                  id: tab.id,
                }))
              )
            }
          >
            <HugeiconsIcon icon={Delete02Icon} />
            Close All
          </ContextMenuItem>
        )}
        <ContextMenuItem
          variant="destructive"
          disabled={count === 0}
          onSelect={() =>
            void closeTabs(
              group.machine.terminals
                .filter((tab) =>
                  family.some((item) => item.view === tabView(tab))
                )
                .map((tab) => ({ machine: group.machine.id, id: tab.id }))
            )
          }
        >
          <HugeiconsIcon icon={Delete02Icon} />
          {group.view === GLOBAL_TERMINALS
            ? 'Close All Except Projects'
            : 'Close All'}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

function WorktreeGroups(props: { machine: string; rootId: string }) {
  useSyncExternalStore(subscribe, getState)
  const page = useTerminalPage()
  const view = useTerminalView()
  const projects = useStore((store) => store.projects)
  const groups = useGroups().filter(
    (group) =>
      group.machine.id === props.machine &&
      (group.view === props.rootId || group.parentId === props.rootId)
  )

  const home = useStore(
    (store) =>
      store.machines.find((machine) => machine.id === props.machine)?.system
        ?.homeDir
  )
  const adding = useRef(false)

  return groups.map((group) => {
    const project = projects.find(
      (item) => item.machine === props.machine && item.id === group.view
    )
    return (
      <DropdownMenuItem
        key={group.view}
        title={project?.path}
        className={cn(
          'group/item',
          group.machine.id === page && group.view === view && 'bg-accent/50'
        )}
        onSelect={() => {
          if (adding.current || group.count === 0) {
            adding.current = false
            void createTab(group.machine.id, group.view)
            return
          }
          showGroup(group.machine.id, group.view)
        }}
      >
        {group.parentId === null ? (
          <GroupIcon group={group} />
        ) : (
          <HugeiconsIcon icon={GitBranchIcon} />
        )}
        <span className="truncate">
          {project === undefined || project.parentId === null
            ? group.name
            : home === undefined
              ? project.path
              : homePath(project.path, home)}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1">
          <GroupCount
            count={group.count}
            alert={alerted(group, page)}
            className="group-data-highlighted/item:hidden"
          />
          <button
            className="text-muted-foreground hover:text-foreground hidden size-5 cursor-pointer place-items-center rounded-sm group-data-highlighted/item:grid pointer-coarse:grid"
            aria-label="New terminal"
            title="New terminal"
            onClick={() => {
              adding.current = true
            }}
          >
            <HugeiconsIcon icon={Add01Icon} className="size-4" />
          </button>
        </span>
      </DropdownMenuItem>
    )
  })
}

function useGroups(): Group[] {
  const machines = useStore((store) => store.machines)
  const projects = useStore((store) => store.projects)

  return machines.flatMap((machine) => {
    const tabs = machine.status === 'online' ? machine.terminals : []
    const tabProjects = tabs.flatMap((tab) =>
      tab.projectId === null ? [] : [tab.projectId]
    )
    const ranked = rankProjects(
      projects.filter(
        (project) =>
          machine.status === 'online' &&
          project.machine === machine.id &&
          !project.hidden &&
          !project.scratch &&
          project.parentId === null
      )
    )
    const projectIds = [
      ...new Set([
        ...withWorktrees([
          ...ranked.top,
          ...ranked.more.filter((root) =>
            projects.some(
              (project) =>
                project.machine === machine.id &&
                (project.id === root.id || project.parentId === root.id) &&
                tabProjects.includes(project.id)
            )
          ),
          ...projects.filter(
            (project) =>
              project.machine === machine.id &&
              !project.scratch &&
              project.parentId !== null
          ),
        ]).map((project) => project.id),
        ...tabProjects,
      ]),
    ]
    return [
      {
        machine,
        view: GLOBAL_TERMINALS,
        name: machine.name,
        count: tabs.filter((tab) => tab.projectId === null).length,
        parentId: null,
      },
      ...projectIds.map((projectId) => {
        const project = projects.find(
          (item) => item.machine === machine.id && item.id === projectId
        )
        return {
          machine,
          view: projectId,
          name: groupName(project),
          count: tabs.filter((tab) => tab.projectId === projectId).length,
          parentId: project?.parentId ?? null,
        }
      }),
    ]
  })
}

export function groupName(project: MachineProject | undefined) {
  if (project === undefined) {
    return 'Removed project'
  }
  const branch = worktreeBranch(project)
  return branch === null ? project.name : `${project.name} · ${branch}`
}

function alerted(group: Group, machine: string | null) {
  const state = getState()
  return (
    group.machine.id === machine &&
    state.layout.tabs.some(
      (tab) =>
        (tab.projectId ?? GLOBAL_TERMINALS) === group.view &&
        state.alerts.includes(tab.id)
    )
  )
}

function GroupIcon(props: { group: Group }) {
  if (props.group.view === GLOBAL_TERMINALS) {
    return (
      <MachineLogo
        icon={props.group.machine.icon}
        className="size-4 shrink-0"
      />
    )
  }
  return (
    <ProjectIcon
      machine={props.group.machine.id}
      projectId={props.group.view}
      className="size-4 shrink-0"
    />
  )
}

function GroupCount(props: {
  count: number
  alert: boolean
  className?: string
}) {
  if (props.count === 0) {
    return null
  }
  return (
    <span
      className={cn(
        'ml-auto grid h-4 min-w-4 shrink-0 place-items-center rounded-full px-1 text-[10px] leading-none font-medium tabular-nums',
        props.alert
          ? 'bg-primary text-primary-foreground'
          : 'text-foreground/75 bg-[color-mix(in_srgb,var(--foreground)_8%,var(--background))]',
        props.className
      )}
    >
      {props.count}
    </span>
  )
}
