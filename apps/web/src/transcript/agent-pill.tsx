import { ArrowLeft01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { text, type ToolUse } from '@/transcript/tool-details'

const tones = new Map([
  ['build', 'text-blue-400'],
  ['explore', 'text-yellow-400'],
  ['plan', 'text-pink-400'],
  ['review', 'text-green-400'],
  ['writer', 'text-purple-400'],
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

export function agentOf(tool: ToolUse) {
  const raw = text(tool.input.subagent_type)
  const type = raw === '' ? 'general-purpose' : raw
  const key = type.toLowerCase()
  let hash = 0
  for (const character of key)
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  return {
    name: type[0].toUpperCase() + type.slice(1),
    description: text(tool.input.description),
    tone: tones.get(key) ?? palette[hash % palette.length],
  }
}

function SubagentIcon(props: { className: string }) {
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

function AgentSpinner(props: { className: string }) {
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

export function AgentPill(props: {
  tool: ToolUse
  running: boolean
  onOpen: () => void
}) {
  const agent = agentOf(props.tool)
  return (
    <button
      type="button"
      onClick={props.onOpen}
      aria-label={`Open ${agent.name} agent: ${agent.description}`}
      className="group/agent bg-secondary focus-visible:ring-ring/70 flex w-fit max-w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] leading-5 tracking-[-0.04px] select-none focus-visible:ring-2 focus-visible:outline-none"
    >
      {props.running ? (
        <AgentSpinner className={agent.tone} />
      ) : (
        <SubagentIcon className={agent.tone} />
      )}
      <span className="text-foreground shrink-0 font-medium">{agent.name}</span>
      {agent.description !== '' && (
        <span className="text-foreground min-w-0 truncate">
          {agent.description}
        </span>
      )}
      <span className="text-muted-foreground/70 -ms-2 flex w-0 shrink-0 -translate-x-1 overflow-hidden opacity-0 transition-all group-hover/agent:ms-0 group-hover/agent:w-4 group-hover/agent:translate-x-0 group-hover/agent:opacity-100 group-focus-visible/agent:ms-0 group-focus-visible/agent:w-4 group-focus-visible/agent:translate-x-0 group-focus-visible/agent:opacity-100 pointer-coarse:ms-0 pointer-coarse:w-4 pointer-coarse:translate-x-0 pointer-coarse:opacity-100">
        <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
      </span>
    </button>
  )
}

export function AgentHeader(props: {
  tool: ToolUse
  running: boolean
  onBack: () => void
}) {
  const agent = agentOf(props.tool)
  return (
    <div className="bg-background sticky top-0 z-30 flex min-w-0 items-center gap-2 pb-3 text-[13px] leading-5 tracking-[-0.04px]">
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label="Back to the main thread"
        onClick={props.onBack}
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
      </Button>
      {props.running ? (
        <AgentSpinner className={agent.tone} />
      ) : (
        <SubagentIcon className={agent.tone} />
      )}
      <span className="text-foreground shrink-0 font-medium">{agent.name}</span>
      {agent.description !== '' && (
        <span className="text-muted-foreground min-w-0 truncate">
          {agent.description}
        </span>
      )}
    </div>
  )
}
