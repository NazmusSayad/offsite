import { ArrowLeft01Icon, XIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { Activity, Message } from '@server/protocol'
import { useLayoutEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Markdown } from '@/markdown/markdown'
import { useStore } from '@/store'
import { AgentSpinner, agentOf, SubagentIcon } from '@/transcript/agent-pill'
import { isPrompt, isTool, turnRows } from '@/transcript/timeline'
import { text, type ToolResult, type ToolUse } from '@/transcript/tool-details'
import { ToolRow } from '@/transcript/tool-row'
import { RowView } from '@/transcript/transcript'

const notification = /<task-id>(\w+)<\/task-id>[\s\S]*?<status>(\w+)<\/status>/g

const labels = new Map([
  ['completed', 'Done'],
  ['failed', 'Failed'],
  ['killed', 'Stopped'],
  ['stopped', 'Stopped'],
])

export function subagents(messages: Message[], activity: Activity | undefined) {
  const results = new Map<string, ToolResult>()
  const agents = new Map<
    string,
    { tool: ToolUse; state: string; agentId: string }
  >()
  const owners = new Map<
    string,
    { tool: ToolUse; state: string; agentId: string }
  >()
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
      if (block.type === 'tool_use' && block.name === 'SendMessage') {
        const owner = owners.get(text(block.input.to))
        if (owner !== undefined) owner.state = 'background'
      }
      if (block.type === 'tool_result') {
        results.set(block.toolUseId, block)
        const agent = agents.get(block.toolUseId)
        if (agent !== undefined) {
          const output = block.content
            .map((item) => (item.type === 'text' ? item.text : ''))
            .join('\n')
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
      }
      if (
        message.type === 'user' &&
        block.type === 'text' &&
        block.text.startsWith('<task-notification>')
      )
        for (const match of block.text.matchAll(notification)) {
          const owner = owners.get(match[1])
          if (owner !== undefined) owner.state = match[2]
        }
    }
  }
  return {
    results,
    items: [...agents.values()].map((agent) => ({
      tool: agent.tool,
      agentId: agent.agentId,
      status: statusOf(agent.state, activity),
    })),
  }
}

function statusOf(state: string, activity: Activity | undefined) {
  if (state === 'foreground')
    return activity?.running === true ? 'Running' : 'Stopped'
  if (state === 'background')
    return activity === undefined ? 'Stopped' : 'Running'
  return labels.get(state) ?? state
}

export function AgentsPanel(props: {
  cwd: string
  agentId: string | null
  onSelect: (id: string | null) => void
  onOpenDiff: () => void
  onClose: () => void
}) {
  const messages = useStore((state) => state.messages)
  const earlier = useStore((state) => state.earlier)
  const activity = useStore((state) => {
    const sessionId = state.selection?.sessionId ?? null
    return sessionId === null ? undefined : state.activity[sessionId]
  })
  const allMessages = [...earlier, ...messages]
  const found = subagents(allMessages, activity)
  const selected = found.items.find((item) => item.tool.id === props.agentId)
  const agent =
    selected === undefined
      ? null
      : { ...agentOf(selected.tool), running: selected.status === 'Running' }

  return (
    <div className="bg-background flex h-full min-h-0 min-w-0 flex-col">
      <div className="border-border/60 bg-background flex h-(--workspace-topbar-height) shrink-0 items-center justify-between gap-2 border-b pr-32 pl-3">
        {agent === null && (
          <span className="text-foreground min-w-0 truncate text-xs font-medium">
            Agents
          </span>
        )}
        {agent !== null && (
          <div className="flex min-w-0 items-center gap-2 text-xs">
            <Button
              size="icon-sm"
              variant="ghost"
              title="Back to agents"
              aria-label="Back to agents"
              onClick={() => props.onSelect(null)}
            >
              <HugeiconsIcon icon={ArrowLeft01Icon} className="size-3.5" />
            </Button>
            {agent.running ? (
              <AgentSpinner className={agent.tone} />
            ) : (
              <SubagentIcon className={agent.tone} />
            )}
            <span className="text-foreground shrink-0 font-medium">
              {agent.name}
            </span>
            {agent.description !== '' && (
              <span className="text-muted-foreground min-w-0 truncate">
                {agent.description}
              </span>
            )}
          </div>
        )}
        <Button
          size="icon-sm"
          variant="ghost"
          title="Close"
          aria-label="Close"
          onClick={props.onClose}
        >
          <HugeiconsIcon icon={XIcon} className="size-3.5" />
        </Button>
      </div>
      {selected === undefined && (
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {found.items.length === 0 && (
            <p className="text-muted-foreground p-6 text-center text-xs">
              No agents in this thread.
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            {[
              ...found.items.filter((item) => item.status === 'Running'),
              ...found.items.filter((item) => item.status !== 'Running'),
            ].map((item) => {
              const info = agentOf(item.tool)
              return (
                <button
                  key={item.tool.id}
                  type="button"
                  aria-label={`Open ${info.name} agent: ${info.description}`}
                  className="bg-secondary hover:bg-accent focus-visible:ring-ring/70 flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] leading-5 tracking-[-0.04px] select-none focus-visible:ring-2 focus-visible:outline-none"
                  onClick={() => props.onSelect(item.tool.id)}
                >
                  {item.status === 'Running' ? (
                    <AgentSpinner className={info.tone} />
                  ) : (
                    <SubagentIcon className={info.tone} />
                  )}
                  <span className="text-foreground shrink-0 font-medium">
                    {info.name}
                  </span>
                  <span className="text-foreground min-w-0 flex-1 truncate">
                    {info.description}
                  </span>
                  <span
                    className={cn(
                      'text-muted-foreground shrink-0 text-xs',
                      item.status === 'Failed' && 'text-destructive'
                    )}
                  >
                    {item.status}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
      {selected !== undefined && (
        <AgentView
          key={selected.tool.id}
          tool={selected.tool}
          running={selected.status === 'Running'}
          messages={allMessages}
          results={found.results}
          agents={found.items}
          cwd={props.cwd}
          onSelect={props.onSelect}
          onOpenDiff={props.onOpenDiff}
        />
      )}
    </div>
  )
}

function AgentView(props: {
  tool: ToolUse
  running: boolean
  messages: Message[]
  results: Map<string, ToolResult>
  agents: ReturnType<typeof subagents>['items']
  cwd: string
  onSelect: (id: string) => void
  onOpenDiff: () => void
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)
  const [expanded, setExpanded] = useState<string[]>([])

  useLayoutEffect(() => {
    const element = scroller.current
    if (element !== null && pinned.current)
      element.scrollTop = element.scrollHeight
  }, [props.messages, props.running])

  function toggle(key: string) {
    setExpanded(
      expanded.includes(key)
        ? expanded.filter((item) => item !== key)
        : [...expanded, key]
    )
  }

  const agentMessages = props.messages.filter(
    (message) => message.type !== 'notice' && message.parent === props.tool.id
  )
  const prompt =
    agentMessages[0]?.type === 'user' && isPrompt(agentMessages[0].content)
      ? agentMessages[0]
      : null
  const rows = turnRows(
    {
      prompt: null,
      first: false,
      items: prompt === null ? agentMessages : agentMessages.slice(1),
    },
    props.cwd,
    props.running ? { partial: '' } : null
  )

  return (
    <div
      ref={scroller}
      className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 pt-1 pb-8"
      onScroll={(event) => {
        const element = event.currentTarget
        pinned.current =
          element.scrollHeight - element.scrollTop - element.clientHeight < 40
      }}
    >
      {prompt !== null && (
        <ToolRow
          title="Prompt"
          pending={false}
          grouped
          open={expanded.includes('prompt')}
          onToggle={() => toggle('prompt')}
        >
          <Markdown
            text={prompt.content
              .flatMap((block) => (block.type === 'text' ? [block.text] : []))
              .join('\n')}
            className="text-muted-foreground text-[13px]"
          />
        </ToolRow>
      )}
      {rows.map((row, index) => {
        const previous = rows[index - 1]
        return (
          <div
            key={row.key}
            className={cn(
              previous === undefined
                ? 'pt-2'
                : row.kind === 'working'
                  ? undefined
                  : isTool(row) && isTool(previous)
                    ? 'pt-2'
                    : 'pt-4',
              row.kind === 'assistant' && 'group/assistant'
            )}
          >
            <RowView
              row={row}
              results={props.results}
              agents={props.agents}
              running={props.running}
              fork={false}
              rewind={false}
              expanded={expanded.includes(row.key)}
              onToggle={() => toggle(row.key)}
              onOpenAgent={(tool) => props.onSelect(tool.id)}
              onRewind={() => {
                throw new Error('Rewind is not available in agent transcripts')
              }}
              onOpenDiff={props.onOpenDiff}
              cwd={props.cwd}
            />
          </div>
        )
      })}
    </div>
  )
}
