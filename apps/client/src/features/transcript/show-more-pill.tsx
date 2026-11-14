import { ArrowDown01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { cn } from '@/lib/utils'

export function ShowMorePill(props: {
  open: boolean
  className: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-expanded={props.open}
      onClick={props.onClick}
      className={cn(
        'text-muted-foreground hover:text-foreground border-border/60 focus-visible:ring-ring/70 sticky bottom-6 z-10 mx-auto flex h-6 w-fit translate-y-1/2 cursor-pointer items-center gap-0.5 rounded-full border px-2 text-[11px] transition-colors select-none focus-visible:ring-2 focus-visible:outline-none',
        props.className
      )}
    >
      {props.open ? 'Show less' : 'Show more'}
      <HugeiconsIcon
        icon={ArrowDown01Icon}
        strokeWidth={2.5}
        className={cn(
          'size-2.5 transition-transform',
          props.open && 'rotate-180'
        )}
      />
    </button>
  )
}
