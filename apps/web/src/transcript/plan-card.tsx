import { MoreHorizontalIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useCopy } from '@/lib/clipboard'
import { cn } from '@/lib/utils'
import { Markdown } from '@/markdown/markdown'

export function PlanCard(props: { plan: string }) {
  const [expanded, setExpanded] = useState(false)
  const clipboard = useCopy()
  const plan = props.plan
  const title = planTitle(plan)
  const canCollapse = plan.length > 900 || plan.split('\n').length > 20
  const collapsed = canCollapse && !expanded
  const contents = `${plan.trimEnd()}\n`
  return (
    <div className="border-border/80 bg-card/70 rounded-3xl border p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="bg-secondary text-secondary-foreground relative inline-flex h-5.5 min-w-5.5 shrink-0 items-center justify-center gap-1 rounded-sm border border-transparent px-[calc(--spacing(1)-1px)] text-sm font-medium whitespace-nowrap sm:h-4.5 sm:min-w-4.5 sm:text-xs">
            Plan
          </span>
          <h3 className="text-foreground truncate text-sm font-medium">
            {title ?? 'Proposed plan'}
          </h3>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button aria-label="Plan actions" size="icon-xs" variant="outline">
              <HugeiconsIcon icon={MoreHorizontalIcon} className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault()
                void clipboard.copy(contents)
              }}
            >
              {clipboard.copied ? 'Copied!' : 'Copy to clipboard'}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                const url = URL.createObjectURL(
                  new Blob([contents], { type: 'text/markdown;charset=utf-8' })
                )
                const anchor = document.createElement('a')
                anchor.href = url
                anchor.download = `${planFileName(title ?? 'plan')}.md`
                anchor.click()
                setTimeout(() => URL.revokeObjectURL(url), 0)
              }}
            >
              Download as markdown
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="mt-4">
        <div
          className={cn('relative', collapsed && 'max-h-104 overflow-hidden')}
        >
          <Markdown
            text={collapsed ? planPreview(plan) : displayedPlan(plan)}
          />
          {collapsed && (
            <div className="from-card/95 via-card/80 pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-linear-to-t to-transparent" />
          )}
        </div>
        {canCollapse && (
          <div className="mt-4 flex justify-center">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? 'Collapse plan' : 'Expand plan'}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

function planTitle(plan: string) {
  const heading = /^\s{0,3}#{1,6}\s+(.+)$/m.exec(plan)?.[1]?.trim()
  return heading === undefined || heading === '' ? null : heading
}

function displayedPlan(plan: string) {
  const lines = plan.trimEnd().split(/\r?\n/)
  const source = /^\s{0,3}#{1,6}\s+/.test(lines[0] ?? '')
    ? lines.slice(1)
    : lines
  while (source[0]?.trim() === '') source.shift()
  if (
    /^\s{0,3}#{1,6}\s+(.+)$/
      .exec(source[0] ?? '')?.[1]
      ?.trim()
      .toLowerCase() === 'summary'
  ) {
    source.shift()
    while (source[0]?.trim() === '') source.shift()
  }
  return source.join('\n')
}

function planPreview(plan: string) {
  const lines = displayedPlan(plan)
    .trimEnd()
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
  const preview: string[] = []
  let visible = 0
  let more = false
  for (const line of lines) {
    const shown = line.trim() !== ''
    if (shown && visible >= 10) {
      more = true
      break
    }
    preview.push(line)
    if (shown) visible += 1
  }
  while (preview.length > 0 && preview.at(-1)?.trim() === '') preview.pop()
  if (preview.length === 0)
    return planTitle(plan) ?? 'Plan preview unavailable.'
  if (more) preview.push('', '...')
  return preview.join('\n')
}

function planFileName(title: string) {
  const name = title
    .toLowerCase()
    .replace(/[`'".,!?()[\]{}]+/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return name === '' ? 'plan' : name
}
