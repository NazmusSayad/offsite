import { ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { Item } from '@offsite/core/protocol'
import { taskTitle, type threadTasks } from '@/features/transcript/tasks'
import type { AgentItem } from '@/features/transcript/timeline'
import { Shimmer } from '@/features/transcript/tool-row'
import { cn } from '@/lib/utils'

const tones = new Map([
  ['build', 'text-blue-400'],
  ['explore', 'text-yellow-400'],
  ['plan', 'text-pink-400'],
  ['review', 'text-green-400'],
  ['writer', 'text-purple-400'],
])

const verbs = new Map([
  ['Running', 'Launched agent'],
  ['Done', 'Agent finished'],
  ['Failed', 'Agent failed'],
  ['Stopped', 'Agent stopped'],
])

const taskVerbs = new Map([
  ['Running', 'Started in background'],
  ['Done', 'Background task finished'],
  ['Failed', 'Background task failed'],
  ['Stopped', 'Background task stopped'],
])

const palette = [
  'text-sky-400',
  'text-amber-400',
  'text-fuchsia-400',
  'text-emerald-400',
  'text-violet-400',
  'text-cyan-400',
  'text-orange-400',
  'text-teal-400',
  'text-rose-400',
  'text-indigo-400',
  'text-lime-400',
  'text-red-400',
]

export function agentOf(item: Extract<Item, { kind: 'subagent' }>) {
  const type = item.agent
  const key = type.toLowerCase()
  let hash = 0
  for (const character of key) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  }
  return {
    name: type[0].toUpperCase() + type.slice(1),
    description: item.description,
    tone: tones.get(key) ?? palette[hash % palette.length],
  }
}

export function SubagentIcon(props: { className: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      className={cn('size-4 shrink-0', props.className)}
    >
      <path
        d="M4 4.5C4 4.22386 4.22386 4 4.5 4H11.5C11.7761 4 12 4.22386 12 4.5V11.5C12 11.7761 11.7761 12 11.5 12H4.5C4.22386 12 4 11.7761 4 11.5V4.5Z"
        fill="currentColor"
      />
      <path
        d="M14.5 1C14.7761 1 15 1.22386 15 1.5V14.5C15 14.7761 14.7761 15 14.5 15H1.5C1.22386 15 1 14.7761 1 14.5V1.5C1 1.22386 1.22386 1 1.5 1H14.5ZM2 14H14V2H2V14Z"
        fill="currentColor"
      />
    </svg>
  )
}

export function AgentSpinner(props: { className: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className={cn('size-4 shrink-0', props.className)}
    >
      {Array.from({ length: 25 }, (_, index) => (
        <rect
          key={index}
          x={1 + (index % 5) * 3}
          y={1 + Math.floor(index / 5) * 3}
          width={2}
          height={2}
          fill="currentColor"
          className="agent-dot"
          style={{
            animationDelay: `${((index % 5) + Math.floor(index / 5)) * 90}ms`,
          }}
        />
      ))}
    </svg>
  )
}

export function AgentLine(props: {
  item: AgentItem
  agents: ReturnType<typeof threadTasks>['agents']
  tasks: ReturnType<typeof threadTasks>['tasks']
  sending: boolean
  onOpen: (id: string) => void
}) {
  const item = props.item
  if (item.kind === 'agent_message') {
    const target = item.target
    return (
      <Line
        label="Messaged agent"
        detail={item.summary}
        pending={props.sending}
        onOpen={target === null ? null : () => props.onOpen(target)}
      />
    )
  }
  if (item.kind === 'command') {
    const task = props.tasks.find((candidate) => candidate.item.id === item.id)
    if (task === undefined) {
      throw new Error(`Task ${item.id} is missing from the thread`)
    }
    return (
      <Line
        label={
          taskVerbs.get(task.status) ??
          `Background task ${task.status.toLowerCase()}`
        }
        detail={taskTitle(task.item)}
        pending={task.status === 'Running'}
        onOpen={() => props.onOpen(item.id)}
      />
    )
  }
  const agent = props.agents.find((candidate) => candidate.item.id === item.id)
  if (agent === undefined) {
    throw new Error(`Agent ${item.id} is missing from the thread`)
  }
  return (
    <Line
      label={verbs.get(agent.status) ?? `Agent ${agent.status.toLowerCase()}`}
      detail={item.description}
      pending={agent.status === 'Running'}
      onOpen={() => props.onOpen(item.id)}
    />
  )
}

function Line(props: {
  label: string
  detail: string
  pending: boolean
  onOpen: (() => void) | null
}) {
  const content = (
    <>
      <span className="text-muted-foreground shrink-0">
        <Shimmer
          text={props.detail === '' ? props.label : `${props.label}:`}
          active={props.pending}
        />
      </span>
      {props.detail !== '' && (
        <span className="text-foreground min-w-0 truncate">{props.detail}</span>
      )}
    </>
  )
  if (props.onOpen === null) {
    return (
      <div className="flex min-h-7 min-w-0 items-center gap-1 text-[13px] leading-4 tracking-[-0.04px] select-none">
        {content}
      </div>
    )
  }
  return (
    <button
      type="button"
      title="Open in Tasks panel"
      onClick={props.onOpen}
      className="group/agent focus-visible:ring-ring/70 flex min-h-7 w-fit max-w-full cursor-pointer items-center gap-1 rounded-md text-left text-[13px] leading-4 tracking-[-0.04px] select-none focus-visible:ring-2 focus-visible:outline-none"
    >
      {content}
      <span className="text-muted-foreground/70 flex shrink-0 opacity-0 transition-opacity group-hover/agent:opacity-100 group-focus-visible/agent:opacity-100 pointer-coarse:opacity-100">
        <HugeiconsIcon icon={ArrowRight01Icon} className="size-3.5" />
      </span>
    </button>
  )
}
