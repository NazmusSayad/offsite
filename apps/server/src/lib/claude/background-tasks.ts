import type { SDKBackgroundTasksChangedMessage } from '@anthropic-ai/claude-agent-sdk'
import { holdsCompletion } from '../live.ts'
import type { Run } from './run.ts'

export function applyBackgroundTasks(
  run: Run,
  message: SDKBackgroundTasksChangedMessage
) {
  const held = holdsCompletion(run)
  const live = message.tasks.filter((task) => task.ambient !== true)
  run.agentTasks = message.tasks.filter(
    (task) => task.task_type !== 'local_bash'
  ).length
  run.backgroundTasks = live.length
  run.backgroundAgents = live.filter(
    (task) => task.task_type === 'local_agent'
  ).length
  run.commands = live
    .filter((task) => task.task_type === 'local_bash')
    .map((task) => ({ id: task.task_id, description: task.description }))
  run.tasks = {
    ...Object.fromEntries(
      Object.entries(run.tasks).filter(([, status]) => status !== 'running')
    ),
    ...Object.fromEntries(
      live.map((task) => [task.task_id, 'running' as const])
    ),
  }
  run.finished.tasksChanged(run, held)
}
