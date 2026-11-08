import type { Item, ItemStatus } from '@offsite/core/items'
import type { SessionActivity } from '@offsite/core/sessions'
import { selectedActivity, type State } from '@/lib/store'

const labels: Record<ItemStatus, string> = {
  running: 'Running',
  completed: 'Done',
  failed: 'Failed',
  stopped: 'Stopped',
}

export function threadTasks(
  items: Item[],
  activity: SessionActivity | undefined
) {
  return {
    agents: items.flatMap((item) =>
      item.kind === 'subagent'
        ? [
            {
              item,
              agentId: item.agentId,
              status: statusOf(item.status, item.agentId, activity),
            },
          ]
        : []
    ),
    tasks: items.flatMap((item) =>
      item.kind === 'command' && item.background !== null
        ? [
            {
              item,
              taskId: item.background.taskId,
              path: item.background.outputPath,
              events: item.background.events,
              status: statusOf(item.status, item.background.taskId, activity),
            },
          ]
        : []
    ),
  }
}

export function taskStatuses(state: State) {
  if (state.selection?.sessionId === null) {
    return []
  }
  const found = threadTasks(
    [...state.earlier, ...state.items],
    selectedActivity(state)
  )
  return [...found.agents, ...found.tasks].map((item) => item.status)
}

export function taskTitle(item: Extract<Item, { kind: 'command' }>) {
  return item.description === '' ? item.command : item.description
}

function statusOf(
  status: ItemStatus,
  id: string | null,
  activity: SessionActivity | undefined
) {
  const live = id === null ? undefined : activity?.tasks[id]
  if (live !== undefined) {
    return labels[live]
  }
  if (status !== 'running') {
    return labels[status]
  }
  return id === null && activity?.running === true ? 'Running' : 'Stopped'
}
