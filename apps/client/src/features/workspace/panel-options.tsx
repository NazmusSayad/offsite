import {
  BrowserIcon,
  GitCompareIcon,
  SquareTerminalIcon,
  TaskDaily01Icon,
  VisualStudioCodeIcon,
} from '@hugeicons/core-free-icons'
import type { IconSvgElement } from '@hugeicons/react'
import { sumBy } from 'es-toolkit'
import { type ReactNode, useSyncExternalStore } from 'react'
import {
  getState as terminalState,
  subscribe as subscribeTerminal,
} from '@/features/terminal/session'
import { selectedTasks } from '@/features/transcript/tasks'
import type { Prefs } from '@/lib/prefs'
import { showEditor, useStore } from '@/lib/store'
import { mod } from '@/lib/utils'
import type { ToggleProps } from './panels'

type MenuOption = {
  id: Prefs['toolbar'][number]
  label: string
  title: string
  hotkey: { keyName: string; placement: 'below-start' | 'below-end' } | null
  icon: IconSvgElement
  pressed: boolean
  dot: { color: string | null; status: ReactNode } | null
  attention: string | null
  onSelect: () => void
}

export function usePanelOptions(
  props: ToggleProps
): [MenuOption, ...MenuOption[]] {
  const terminalAlert = useSyncExternalStore(
    subscribeTerminal,
    () => terminalState().alerts.length > 0
  )
  const terminalTabs = useSyncExternalStore(
    subscribeTerminal,
    () =>
      terminalState().layout.tabs.filter(
        (tab) => tab.projectId === props.selection.projectId
      ).length
  )
  const agents = useStore(
    (state) =>
      selectedTasks(state).agents.filter((item) => item.status === 'Running')
        .length
  )
  const tasks = useStore(
    (state) =>
      selectedTasks(state).tasks.filter((item) => item.status === 'Running')
        .length
  )
  const tasksColor =
    agents > 0 ? 'text-info' : tasks > 0 ? 'text-muted-foreground' : null
  const taskCounts = [
    agents > 0 ? `${agents} ${agents === 1 ? 'agent' : 'agents'}` : null,
    tasks > 0 ? `${tasks} ${tasks === 1 ? 'task' : 'tasks'}` : null,
  ].filter((label) => label !== null)
  const changed = props.repos.some((repo) => repo.changed > 0)
  const added = sumBy(props.repos, (repo) => repo.added)
  const removed = sumBy(props.repos, (repo) => repo.removed)

  return [
    {
      id: 'diff',
      label: 'Diff',
      title: 'Diff',
      hotkey: null,
      icon: GitCompareIcon,
      pressed: props.panel === 'diff',
      dot: changed
        ? {
            color: 'text-warning',
            status:
              added + removed > 0 ? (
                <>
                  <span className="text-diff-addition">+{added}</span>
                  <span className="text-diff-deletion">-{removed}</span>
                </>
              ) : (
                'Changes'
              ),
          }
        : null,
      attention: changed ? 'text-warning' : null,
      onSelect: () => props.onPanel(props.panel === 'diff' ? null : 'diff'),
    },
    {
      id: 'tasks',
      label: 'Tasks',
      title: 'Tasks',
      hotkey: null,
      icon: TaskDaily01Icon,
      pressed: props.panel === 'tasks',
      dot:
        taskCounts.length > 0
          ? { color: tasksColor, status: taskCounts.join(' · ') }
          : null,
      attention: tasksColor,
      onSelect: () => props.onPanel(props.panel === 'tasks' ? null : 'tasks'),
    },
    {
      id: 'terminal',
      label: 'Terminal',
      title: `Terminal (${mod}+\`)`,
      hotkey: { keyName: '`', placement: 'below-end' },
      icon: SquareTerminalIcon,
      pressed: props.terminal,
      dot:
        terminalTabs > 0
          ? terminalAlert
            ? { color: 'text-info', status: 'Needs you' }
            : { color: 'text-muted-foreground', status: `${terminalTabs} open` }
          : null,
      attention: terminalAlert
        ? 'text-info'
        : terminalTabs > 0
          ? 'text-muted-foreground'
          : null,
      onSelect: () => props.onTerminal(!props.terminal),
    },
    {
      id: 'browser',
      label: 'Browser',
      title: 'Browser',
      hotkey: null,
      icon: BrowserIcon,
      pressed: props.panel === 'browser',
      dot: null,
      attention: null,
      onSelect: () =>
        props.onPanel(props.panel === 'browser' ? null : 'browser'),
    },
    {
      id: 'editor',
      label: 'Editor',
      title: 'Editor',
      hotkey: { keyName: 'E', placement: 'below-start' },
      icon: VisualStudioCodeIcon,
      pressed: false,
      dot: null,
      attention: null,
      onSelect: () =>
        showEditor({
          machine: props.selection.machine,
          projectId: props.selection.projectId,
        }),
    },
  ]
}
