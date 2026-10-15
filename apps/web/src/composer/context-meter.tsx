import { FoldVerticalIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { Context } from '@server/protocol'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { compact } from '@/lib/format'
import { sendPrompt, showError } from '@/store'

export function ContextMeter(props: { context: Context }) {
  const context = props.context
  const radius = 9.75
  const circumference = 2 * Math.PI * radius
  const percent =
    context.window === null
      ? null
      : Math.max(0, Math.min(100, (context.tokens / context.window) * 100))
  const color =
    percent !== null && percent > 90
      ? 'var(--color-error)'
      : 'color-mix(in oklab, var(--color-muted-foreground) 72%, transparent)'
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost-muted"
          size="icon-sm"
          className="size-7"
          aria-label="Context usage"
          title={
            context.window === null
              ? `${context.tokens.toLocaleString()} context tokens used`
              : `Context window ${Math.round(percent ?? 0)}% used · ${compact(context.tokens)}/${compact(context.window)}`
          }
        >
          <span className="relative flex size-5 items-center justify-center">
            <svg
              viewBox="0 0 24 24"
              className="absolute inset-0 size-full -rotate-90"
              aria-hidden="true"
            >
              <circle
                cx="12"
                cy="12"
                r={radius}
                fill="none"
                className="stroke-muted-foreground/24"
                strokeWidth="3"
              />
              <circle
                cx="12"
                cy="12"
                r={radius}
                fill="none"
                stroke={color}
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - (percent ?? 0) / 100)}
                className="transition-[stroke-dashoffset,stroke] duration-500 ease-out"
              />
            </svg>
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="w-72">
        <DropdownMenuLabel className="text-foreground flex justify-between">
          <span>Context window</span>
          <span className="tabular-nums">
            {context.window === null
              ? `${compact(context.tokens)} tokens`
              : `${compact(context.tokens)} / ${compact(context.window)} · ${Math.round(percent ?? 0)}%`}
          </span>
        </DropdownMenuLabel>
        {context.model !== null && (
          <div className="text-muted-foreground -mt-1 px-2 pb-1 text-xs">
            {context.model}
          </div>
        )}
        {context.categories.length > 0 && <DropdownMenuSeparator />}
        {context.categories.map((category) => (
          <div
            key={category.name}
            className={`flex justify-between px-2 py-1 text-xs ${category.kind === 'used' ? '' : 'text-muted-foreground'}`}
          >
            <span>{category.name}</span>
            <span className="tabular-nums">
              {compact(category.tokens)}
              {context.window !== null &&
                ` · ${((category.tokens / context.window) * 100).toFixed(1)}%`}
            </span>
          </div>
        ))}
        {context.sections.map((section) => (
          <div key={section.title}>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{section.title}</DropdownMenuLabel>
            {section.items.map((item) => (
              <div
                key={item.name}
                className="flex justify-between gap-3 px-2 py-1 text-xs"
              >
                <span className="truncate" title={item.name}>
                  {item.name}
                </span>
                <span className="text-muted-foreground shrink-0 tabular-nums">
                  {compact(item.tokens)}
                </span>
              </div>
            ))}
          </div>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() =>
            sendPrompt({ text: '/compact', images: [] }, 'queue').catch(
              showError
            )
          }
        >
          <HugeiconsIcon icon={FoldVerticalIcon} />
          Compact conversation
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
