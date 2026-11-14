import {
  ArrowRight01Icon,
  BubbleChatIncomeIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { SUBAGENT_ICON } from '@offsite/core/icons/agents'
import type { Item } from '@offsite/core/items'
import { useLayoutEffect, useRef, useState } from 'react'
import { Markdown } from '@/components/markdown/markdown'
import { ShowMorePill } from '@/features/transcript/show-more-pill'
import { taskTitle, type threadTasks } from '@/features/transcript/tasks'
import type { AgentItem, ReceivedItem } from '@/features/transcript/timeline'
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
      <path d={SUBAGENT_ICON.inner} fill="currentColor" />
      <path d={SUBAGENT_ICON.outer} fill="currentColor" />
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

export function ReceivedMessage(props: {
  item: ReceivedItem
  open: boolean
  onToggle: () => void
  onOpen: (id: string) => void
}) {
  const target = props.item.target
  const frame = useRef<HTMLFieldSetElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const [long, setLong] = useState(false)
  const folded = props.item.source === 'agent' && !props.open

  useLayoutEffect(() => {
    const element = body.current
    if (element === null) {
      throw new Error('received message is not mounted')
    }
    if (!folded) {
      return
    }
    setLong(element.scrollHeight > element.clientHeight)
    const observer = new ResizeObserver(() =>
      setLong(element.scrollHeight > element.clientHeight)
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [folded])

  return (
    <fieldset
      ref={frame}
      className={cn(
        'border-border max-w-[85%] min-w-0 rounded-md border border-dashed px-3 pt-0.5',
        long && 'mb-3 pb-0',
        !long && 'pb-2'
      )}
    >
      <legend className="text-muted-foreground -ms-1 flex max-w-full min-w-0 items-center gap-1.5 px-1 text-xs select-none">
        {props.item.source === 'agent' ? (
          <SubagentIcon className="size-3.5" />
        ) : (
          <HugeiconsIcon
            icon={BubbleChatIncomeIcon}
            className="size-3.5 shrink-0"
          />
        )}
        {target === null ? (
          <span className="text-foreground min-w-0 truncate font-medium">
            {props.item.sender}
          </span>
        ) : (
          <button
            type="button"
            title="Open in Tasks panel"
            onClick={() => props.onOpen(target)}
            className="text-foreground focus-visible:ring-ring/70 min-w-0 cursor-pointer truncate rounded-sm font-medium underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:outline-none"
          >
            {props.item.sender}
          </button>
        )}
      </legend>
      <div
        ref={body}
        className={cn(
          folded && 'max-h-24 overflow-hidden',
          folded && long && 'mask-b-from-20%'
        )}
      >
        <Markdown
          text={props.item.text}
          className="text-muted-foreground text-[13px]"
          lineBreaks
          rawHtml={false}
        />
      </div>
      {long && (
        <ShowMorePill
          open={props.open}
          className="bg-background"
          onClick={() => {
            props.onToggle()
            if (props.open) {
              requestAnimationFrame(() =>
                frame.current?.scrollIntoView({ block: 'nearest' })
              )
            }
          }}
        />
      )}
    </fieldset>
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
