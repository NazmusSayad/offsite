import type { SDKBackgroundTasksChangedMessage } from '@anthropic-ai/claude-agent-sdk'
import type { TaskStatus } from '@offsite/core/sessions'

export function backgroundTasks(
  message: SDKBackgroundTasksChangedMessage,
  tasks: Record<string, TaskStatus>
) {
  const live = message.tasks.filter((task) => task.ambient !== true)
  return {
    agentTasks: message.tasks.filter((task) => task.task_type !== 'local_bash')
      .length,
    backgroundTasks: live.length,
    backgroundAgents: live.filter((task) => task.task_type === 'local_agent')
      .length,
    tasks: {
      ...Object.fromEntries(
        Object.entries(tasks).filter(([, status]) => status !== 'running')
      ),
      ...Object.fromEntries(
        live.map((task) => [task.task_id, 'running' as const])
      ),
    },
  }
}
