import type { Activity, Message } from '@server/protocol'
import {
  resultText,
  text,
  type ToolResult,
  type ToolUse,
} from '@/transcript/tool-details'

const notifications = /<task-notification>([\s\S]*?)<\/task-notification>/g

const labels = new Map([
  ['completed', 'Done'],
  ['failed', 'Failed'],
  ['killed', 'Stopped'],
  ['stopped', 'Stopped'],
])

export function threadTasks(
  messages: Message[],
  activity: Activity | undefined
) {
  const results = new Map<string, ToolResult>()
  const agents = new Map<
    string,
    { tool: ToolUse; state: string; agentId: string }
  >()
  const tasks = new Map<
    string,
    {
      tool: ToolUse
      state: string
      taskId: string
      path: string | null
      events: string[]
    }
  >()
  const owners = new Map<string, { state: string }>()
  const monitors = new Map<string, { events: string[] }>()
  const stops = new Map<string, string>()
  for (const message of messages) {
    if (message.type === 'notice') continue
    for (const block of message.content) {
      if (
        block.type === 'tool_use' &&
        (block.name === 'Agent' || block.name === 'Task')
      )
        agents.set(block.id, {
          tool: block,
          state: 'foreground',
          agentId: '',
        })
      if (
        block.type === 'tool_use' &&
        (block.name === 'Monitor' ||
          (block.name === 'Bash' && block.input.run_in_background === true))
      )
        tasks.set(block.id, {
          tool: block,
          state: 'foreground',
          taskId: '',
          path: null,
          events: [],
        })
      if (block.type === 'tool_use' && block.name === 'SendMessage') {
        const owner = owners.get(text(block.input.to))
        if (owner !== undefined) owner.state = 'background'
      }
      if (block.type === 'tool_use' && block.name === 'TaskStop')
        stops.set(block.id, text(block.input.task_id))
      if (block.type === 'tool_result') {
        results.set(block.toolUseId, block)
        const agent = agents.get(block.toolUseId)
        if (agent !== undefined) {
          const output = resultText(block)
          const agentId = /agentId: (\w+)/.exec(output)?.[1]
          if (agentId !== undefined) {
            owners.set(agentId, agent)
            agent.agentId = agentId
          }
          agent.state = output.startsWith('Async agent launched')
            ? 'background'
            : block.isError
              ? 'failed'
              : 'completed'
        }
        const task = tasks.get(block.toolUseId)
        if (task !== undefined) {
          const output = resultText(block)
          const shell =
            /^Command running in background with ID: (\w+)\. Output is being written to: (.+?\.output)\./.exec(
              output
            )
          const monitor = /^Monitor started \(task (\w+),/.exec(output)
          if (shell !== null) {
            task.taskId = shell[1]
            task.path = shell[2]
          }
          if (monitor !== null) {
            task.taskId = monitor[1]
            monitors.set(monitor[1], task)
          }
          if (task.taskId !== '') owners.set(task.taskId, task)
          task.state =
            task.taskId !== ''
              ? 'background'
              : block.isError
                ? 'failed'
                : 'completed'
        }
        const stopped = stops.get(block.toolUseId)
        const owner = stopped === undefined ? undefined : owners.get(stopped)
        if (owner !== undefined && !block.isError) owner.state = 'stopped'
      }
      if (
        message.type === 'user' &&
        block.type === 'text' &&
        block.text.startsWith('<task-notification>')
      )
        for (const match of block.text.matchAll(notifications)) {
          const body = match[1]
          const status = /<status>(\w+)<\/status>/.exec(body)?.[1]
          const event = /<event>([\s\S]*?)<\/event>/.exec(body)?.[1]
          for (const id of body.matchAll(/<task-id>(\w+)<\/task-id>/g)) {
            const owner = owners.get(id[1])
            if (owner !== undefined && status !== undefined)
              owner.state = status
            const monitor = monitors.get(id[1])
            if (monitor !== undefined && event !== undefined)
              monitor.events.push(event)
          }
        }
    }
  }
  return {
    results,
    agents: [...agents.values()].map((agent) => ({
      tool: agent.tool,
      agentId: agent.agentId,
      status: statusOf(agent.state, agent.agentId, activity),
    })),
    tasks: [...tasks.values()].map((task) => ({
      tool: task.tool,
      taskId: task.taskId,
      path: task.path,
      events: task.events,
      status: statusOf(task.state, task.taskId, activity),
    })),
  }
}

export function taskTitle(tool: ToolUse) {
  const description = text(tool.input.description)
  return description === '' ? text(tool.input.command) : description
}

function statusOf(state: string, id: string, activity: Activity | undefined) {
  const live = activity?.tasks[id]
  if (live === 'running') return 'Running'
  if (live !== undefined) return labels.get(live) ?? live
  if (state === 'foreground')
    return activity?.running === true ? 'Running' : 'Stopped'
  if (state === 'background') return 'Stopped'
  return labels.get(state) ?? state
}
