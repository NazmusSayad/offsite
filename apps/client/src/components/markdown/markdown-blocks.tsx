import {
  CheckIcon,
  ChevronRightIcon,
  CopyIcon,
  Download01Icon,
  FullScreenIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Children,
  type ReactNode,
  isValidElement,
  useRef,
  useState,
} from 'react'
import {
  downloadImage,
  elementImage,
  imageFormats,
} from '@/components/markdown/export-image'
import { PreviewDialog, PreviewHeader } from '@/components/preview-dialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip } from '@/components/ui/tooltip'
import { useCopy } from '@/lib/clipboard'
import { saveBlob } from '@/lib/media'
import { showError } from '@/lib/store'
import { cn } from '@/lib/utils'

export function MarkdownTable(props: { children: ReactNode }) {
  const table = useRef<HTMLTableElement>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const clipboard = useCopy()
  const copyLabel = clipboard.copied ? 'Copied' : 'Copy table'
  return (
    <div className="chat-markdown-table-container">
      <div className="chat-markdown-table-scroll">
        <table ref={table}>{props.children}</table>
      </div>
      <div className="mt-0.5 flex items-center justify-end gap-0.5 select-none">
        <Tooltip label="Fullscreen">
          <Button
            type="button"
            variant="ghost-muted"
            size="icon-xs"
            aria-label="Fullscreen"
            onClick={() => setFullscreen(true)}
          >
            <HugeiconsIcon icon={FullScreenIcon} className="size-3" />
          </Button>
        </Tooltip>
        <DropdownMenu>
          <Tooltip label="Download table">
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost-muted"
                size="icon-xs"
                aria-label="Download table"
              >
                <HugeiconsIcon icon={Download01Icon} className="size-3" />
              </Button>
            </DropdownMenuTrigger>
          </Tooltip>
          <DropdownMenuContent align="end" className="w-auto">
            {imageFormats.map((format) => (
              <DropdownMenuItem
                key={format.type}
                onSelect={() =>
                  void downloadImage(table.current, format, 'table').catch(
                    showError
                  )
                }
              >
                Download as {format.label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem
              onSelect={() =>
                saveBlob(
                  new Blob([tableText(table.current, 'markdown')], {
                    type: 'text/markdown;charset=utf-8',
                  }),
                  'table.md'
                )
              }
            >
              Download as Markdown
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                saveBlob(
                  new Blob([tableText(table.current, 'csv')], {
                    type: 'text/csv;charset=utf-8',
                  }),
                  'table.csv'
                )
              }
            >
              Download as CSV
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
          <DropdownMenuContent align="end" className="w-auto">
            <DropdownMenuItem
              onSelect={() =>
                void clipboard.copy(tableText(table.current, 'markdown'))
              }
            >
              Copy as Markdown
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                void clipboard.copyImage(
                  elementImage(table.current, 'image/png')
                )
              }
            >
              Copy as PNG
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                void clipboard.copy(tableText(table.current, 'csv'))
              }
            >
              Copy as CSV
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <PreviewDialog open={fullscreen} onClose={() => setFullscreen(false)}>
        <PreviewHeader title="Table" />
        <div className="chat-markdown min-h-0 flex-1 overflow-auto p-4 leading-relaxed">
          <table>{props.children}</table>
        </div>
      </PreviewDialog>
    </div>
  )
}

function tableText(
  element: HTMLTableElement | null,
  format: 'markdown' | 'csv'
) {
  if (element === null) {
    throw new Error('Nothing to export')
  }
  const rows = [...element.rows].map((row) =>
    [...row.cells].map((cell) => (cell.textContent ?? '').trim())
  )
  if (format === 'markdown') {
    return rows
      .flatMap((row, index) => {
        const line = `| ${row.map((cell) => cell.replaceAll('|', '\\|')).join(' | ')} |`
        return index === 0
          ? [line, `| ${row.map(() => '---').join(' | ')} |`]
          : [line]
      })
      .join('\n')
  }
  if (format === 'csv') {
    return rows
      .map((row) =>
        row
          .map((cell) =>
            /[",\n]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell
          )
          .join(',')
      )
      .join('\n')
  }
  throw new Error(`Unknown table format: ${format}`)
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
