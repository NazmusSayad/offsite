import {
  CheckIcon,
  ChevronRightIcon,
  CopyIcon,
  Maximize02Icon,
  Minimize02Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Children,
  type ReactNode,
  isValidElement,
  useRef,
  useState,
} from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip } from '@/components/ui/tooltip'
import { useCopy } from '@/lib/clipboard'
import { cn } from '@/lib/utils'

export function MarkdownTable(props: { children: ReactNode }) {
  const table = useRef<HTMLTableElement>(null)
  const [expanded, setExpanded] = useState(true)
  const clipboard = useCopy()
  const expandLabel = expanded ? 'Collapse table cells' : 'Expand table cells'
  const copyLabel = clipboard.copied ? 'Copied' : 'Copy table'
  function copy(format: 'markdown' | 'csv') {
    const element = table.current
    if (element === null) return
    const rows = [...element.rows].map((row) =>
      [...row.cells].map((cell) => (cell.textContent ?? '').trim())
    )
    const text =
      format === 'markdown'
        ? rows
            .flatMap((row, index) => {
              const line = `| ${row.map((cell) => cell.replaceAll('|', '\\|')).join(' | ')} |`
              return index === 0
                ? [line, `| ${row.map(() => '---').join(' | ')} |`]
                : [line]
            })
            .join('\n')
        : rows
            .map((row) =>
              row
                .map((cell) =>
                  /[",\n]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell
                )
                .join(',')
            )
            .join('\n')
    void clipboard.copy(text)
  }
  return (
    <div className="chat-markdown-table-container" data-expanded={expanded}>
      <div className="chat-markdown-table-scroll">
        <table ref={table}>{props.children}</table>
      </div>
      <div className="mt-0.5 flex items-center justify-between select-none">
        <Tooltip label={expandLabel}>
          <Button
            type="button"
            variant={expanded ? 'secondary' : 'ghost-muted'}
            size="icon-xs"
            aria-pressed={expanded}
            aria-label={expandLabel}
            onClick={() => {
              const element = table.current
              if (element !== null && !expanded) {
                const widths: number[] = []
                for (const row of element.rows)
                  [...row.cells].forEach((cell, index) => {
                    widths[index] = Math.max(
                      widths[index] ?? 0,
                      cell.getBoundingClientRect().width
                    )
                  })
                ;[...(element.tHead?.rows[0]?.cells ?? [])].forEach(
                  (cell, index) => {
                    cell.style.minWidth = `${widths[index]}px`
                  }
                )
              }
              setExpanded(!expanded)
            }}
          >
            <HugeiconsIcon
              icon={expanded ? Minimize02Icon : Maximize02Icon}
              className="size-3"
            />
          </Button>
        </Tooltip>
        <DropdownMenu>
          <Tooltip label={copyLabel}>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost-muted"
                size="icon-xs"
                aria-label={copyLabel}
              >
                <HugeiconsIcon
                  icon={clipboard.copied ? CheckIcon : CopyIcon}
                  className="size-3"
                />
              </Button>
            </DropdownMenuTrigger>
          </Tooltip>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => copy('markdown')}>
              Copy as Markdown
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => copy('csv')}>
              Copy as CSV
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

export function MarkdownDetails(props: { open: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(props.open)
  const nodes = Children.toArray(props.children)
  const index = nodes.findIndex(
    (child) => isValidElement(child) && child.type === 'summary'
  )
  const summary = nodes[index]
  return (
    <div className="border-border/60 my-2 border-y">
      <button
        type="button"
        aria-expanded={open}
        className="text-foreground flex w-full items-center gap-2 py-2 text-left text-sm font-medium"
        onClick={() => setOpen(!open)}
      >
        <HugeiconsIcon
          icon={ChevronRightIcon}
          aria-hidden
          className={cn(
            'text-muted-foreground size-4 shrink-0 transition-transform',
            open && 'rotate-90'
          )}
        />
        <span>
          {isValidElement<{ children?: ReactNode }>(summary) &&
          summary.props.children !== undefined
            ? summary.props.children
            : 'Details'}
        </span>
      </button>
      {open && (
        <div className="text-foreground/80 ps-6 pb-3">
          {nodes.filter((_, position) => position !== index)}
        </div>
      )}
    </div>
  )
}
