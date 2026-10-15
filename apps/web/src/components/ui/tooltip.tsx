import { Tooltip as TooltipPrimitive } from 'radix-ui'
import type { ReactNode } from 'react'

export function Tooltip(props: {
  label: ReactNode
  side?: 'top' | 'bottom' | 'left'
  children: ReactNode
}) {
  return (
    <TooltipPrimitive.Provider delayDuration={600}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>
          {props.children}
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={props.side ?? 'top'}
            sideOffset={4}
            collisionPadding={5}
            className="bg-popover text-popover-foreground animate-in fade-in-0 zoom-in-98 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-98 relative z-[140] flex max-w-80 origin-(--radix-tooltip-content-transform-origin) rounded-md border px-2 py-1 text-xs leading-snug text-balance wrap-anywhere whitespace-normal shadow-md/5 not-dark:bg-clip-padding before:pointer-events-none before:absolute before:inset-0 before:rounded-[calc(var(--radius-md)-1px)] before:shadow-[0_1px_--theme(--color-black/4%)] dark:before:shadow-[0_-1px_--theme(--color-white/6%)]"
          >
            {props.label}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  )
}
