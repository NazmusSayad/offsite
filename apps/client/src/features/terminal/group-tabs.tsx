import { Cancel01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { GLOBAL_TERMINALS } from '@offsite/core/terminal'
import { useSyncExternalStore } from 'react'
import { worktreeBranch } from '@/api/projects'
import { useStore } from '@/lib/store'
import { useTerminalPage, useTerminalView } from '@/lib/url'
import { cn } from '@/lib/utils'
import { closeTab, closeTabs } from './close-tab'
import type { Group } from './groups'
import { showGroup } from './page'
import {
  getState,
  machineTabAlerted,
  machineTabTitle,
  sendTo,
  subscribe,
  tabView,
} from './session'

export function GroupTabs(props: { family: Group[] }) {
  const state = useSyncExternalStore(subscribe, getState)
  const worktrees = useStore((store) => store.worktrees)
  const page = useTerminalPage()
  const view = useTerminalView()
  const machine = props.family[0].machine
  const tabs = props.family.flatMap((group) =>
    machine.terminals.filter((tab) => tabView(tab) === group.view)
  )

  return tabs.map((tab) => {
    const current =
      machine.id === page &&
      tabView(tab) === view &&
      state.layout.active[view] === tab.id
    const worktree =
      tab.worktreeId === null
        ? null
        : worktrees.find(
            (item) => item.machine === machine.id && item.id === tab.worktreeId
          )
    return (
      <div
        key={tab.id}
        className={cn(
          'text-muted-foreground hover:bg-accent hover:text-accent-foreground relative shrink-0 rounded-sm',
          current && 'bg-accent text-accent-foreground'
        )}
      >
        <button
          className={cn(
            'flex h-8 w-full cursor-pointer items-center gap-1.5 rounded-sm pr-9 pl-8 text-left text-[13px]',
            props.family[0].view !== GLOBAL_TERMINALS && 'pl-12'
          )}
          onClick={() => {
            sendTo(machine.id, {
              type: 'select',
              view: tabView(tab),
              tabId: tab.id,
            })
            showGroup(machine.id, tab)
          }}
        >
          <span className="truncate">{machineTabTitle(machine.id, tab)}</span>
          {worktree !== null && (
            <span className="text-muted-foreground shrink-0 text-xs">
              {worktree === undefined
                ? 'Removed worktree'
                : worktreeBranch(worktree)}
            </span>
          )}
          {machineTabAlerted(machine.id, tab.id) && (
            <span className="bg-primary size-1.5 shrink-0 rounded-full" />
          )}
        </button>
        <button
          className="text-muted-foreground hover:text-foreground absolute top-1 right-1.5 grid size-6 cursor-pointer place-items-center rounded-md"
          aria-label="Close tab"
          title="Close tab"
          onClick={() => {
            if (machine.id === page) {
              void closeTab(tab.id)
              return
            }
            void closeTabs([{ machine: machine.id, id: tab.id }])
          }}
        >
          <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
        </button>
      </div>
    )
  })
}
