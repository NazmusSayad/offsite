import { ArrowDown01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Shimmer(props: { text: string; active: boolean }) {
  return (
    <span className={cn(props.active && 'text-shimmer')}>{props.text}</span>
  )
}

function ToolTitle(props: {
  title: string
  subtitle?: ReactNode
  args?: string[]
  pending: boolean
  grouped: boolean
}) {
  return (
    <span
      className={cn(
        'flex min-w-0 items-baseline overflow-hidden text-[13px] leading-4 tracking-[-0.04px]',
        props.grouped ? 'gap-1.5' : 'gap-2'
      )}
    >
      <span
        className={cn(
          'text-foreground shrink-0',
          props.grouped ? 'font-normal' : 'font-medium'
        )}
      >
        <Shimmer text={props.title} active={props.pending} />
      </span>
      {props.subtitle !== undefined && props.subtitle !== '' && (
        <span
          className={cn(
            'min-w-0 truncate tabular-nums',
            props.grouped ? 'text-muted-foreground/70' : 'text-muted-foreground'
          )}
        >
          {props.subtitle}
        </span>
      )}
      {props.args?.map((arg) => (
        <span
          key={arg}
          className={cn(
            'min-w-0 truncate tabular-nums',
            props.grouped ? 'text-muted-foreground/70' : 'text-muted-foreground'
          )}
        >
          {arg}
        </span>
      ))}
    </span>
  )
}

export function Disclosure(props: { open: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'text-muted-foreground/70 flex size-6 shrink-0 items-center justify-center transition-opacity',
        props.open ? 'opacity-100' : 'opacity-0 group-hover/tool:opacity-100',
        props.className
      )}
    >
      <HugeiconsIcon
        icon={ArrowDown01Icon}
        strokeWidth={2.5}
        className={cn(
          'size-3.5 transition-transform',
          !props.open && '-rotate-90'
        )}
      />
    </span>
  )
}

export function ToolRow(props: {
  title: string
  subtitle?: ReactNode
  args?: string[]
  pending: boolean
  grouped: boolean
  open: boolean
  onToggle: (() => void) | null
  rail?: boolean
  children?: ReactNode
}) {
  const toggle = props.onToggle
  const trigger = (
    <>
      <span className="flex max-w-[calc(100%-24px)] min-w-0 items-center">
        <ToolTitle
          title={props.title}
          subtitle={props.subtitle}
          args={props.args}
          pending={props.pending}
          grouped={props.grouped}
        />
      </span>
      {toggle !== null && <Disclosure open={props.open} />}
    </>
  )
  return (
    <div className="flex w-full min-w-0 flex-col">
      {toggle === null ? (
        <div
          className={cn(
            'flex w-full items-center select-none',
            props.grouped ? 'min-h-7' : 'min-h-9'
          )}
        >
          {trigger}
        </div>
      ) : (
        <button
          type="button"
          aria-expanded={props.open}
          onClick={toggle}
          className={cn(
            'group/tool focus-visible:ring-ring/70 flex w-full cursor-pointer items-center rounded-md text-left select-none focus-visible:ring-2 focus-visible:outline-none',
            props.grouped ? 'h-7' : 'h-9'
          )}
        >
          {trigger}
        </button>
      )}
      {props.open && props.children !== undefined && (
        <div className={cn('min-w-0 pt-1', props.rail !== false && 'ps-3')}>
          {props.children}
        </div>
      )}
    </div>
  )
}
