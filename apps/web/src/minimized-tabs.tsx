import { Layers01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { attention } from '@/attention'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { send, type Tab, tabTitle } from '@/session'

export function MinimizedTabs(props: {
  groupId: number
  tabs: Tab[]
  alerts: number[]
  bordered: boolean
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            'flex flex-none items-center gap-1 px-2.5 text-muted-foreground transition-colors hover:text-foreground',
            props.bordered && 'border-r border-b'
          )}
          aria-label="Minimized tabs"
          title="Minimized tabs"
        >
          <HugeiconsIcon icon={Layers01Icon} className="size-4" />
          <CountBadge
            count={props.tabs.length}
            alert={props.tabs.some((tab) => props.alerts.includes(tab.id))}
          />
          {attention(props.tabs.map((tab) => tab.id)) !== 'alert' && (
            <AttentionDot
              ids={props.tabs.map((tab) => tab.id)}
              className="size-1.5 flex-none rounded-full"
            />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {props.tabs.map((tab) => (
          <DropdownMenuItem
            key={tab.id}
            onSelect={() =>
              send({ type: 'select', groupId: props.groupId, tabId: tab.id })
            }
          >
            <span className="max-w-80 truncate">{tabTitle(tab)}</span>
            <AttentionDot
              ids={[tab.id]}
              className="size-1.5 flex-none rounded-full"
            />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function AttentionDot(props: { ids: number[]; className: string }) {
  const current = attention(props.ids)
  if (current === null) return null
  if (current === 'alert')
    return <span key="alert" className={cn('bg-primary', props.className)} />
  return (
    <span
      role="img"
      aria-label="New output"
      title="New output"
      className={cn('bg-muted-foreground', props.className)}
    />
  )
}

export function CountBadge(props: {
  count: number
  alert: boolean
  className?: string
}) {
  return (
    <span
      className={cn(
        'grid h-3.5 min-w-3.5 place-items-center rounded-full px-1 text-[9px] leading-none font-medium tabular-nums',
        props.alert
          ? 'bg-primary text-primary-foreground'
          : 'bg-[color-mix(in_srgb,var(--text)_22%,var(--bg))] text-foreground',
        props.className
      )}
    >
      {props.count}
    </span>
  )
}
