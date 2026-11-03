import {
  CheckIcon,
  CopyIcon,
  FileExportIcon,
  MinusSignIcon,
  Tick02Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  type ContextUsage,
  type ExportDetail,
  exportDetails,
} from '@offsite/core/sessions'
import { Slider } from 'radix-ui'
import { useEffect, useState } from 'react'
import { call } from '@/api/connection'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useCopy } from '@/lib/clipboard'
import { compact } from '@/lib/format'
import { saveBlob } from '@/lib/media'
import { type MachineSession, showError, showExport } from '@/lib/store'
import { cn } from '@/lib/utils'

const levels: Record<ExportDetail, string> = {
  messages: 'Messages',
  steps: 'Steps',
  details: 'Details',
  full: 'Everything',
}

const contents: {
  label: string
  how: Record<ExportDetail, string | null>
}[] = [
  {
    label: 'Messages, plans and answers',
    how: {
      messages: 'Full text',
      steps: 'Full text',
      details: 'Full text',
      full: 'Full text',
    },
  },
  {
    label: 'Commands',
    how: {
      messages: null,
      steps: 'One line each',
      details: 'Full command',
      full: 'Command and output',
    },
  },
  {
    label: 'File edits',
    how: {
      messages: null,
      steps: 'File path',
      details: 'Path and diff',
      full: 'Diff and output',
    },
  },
  {
    label: 'Tools, skills and web searches',
    how: {
      messages: null,
      steps: 'Name only',
      details: 'Inputs and search results',
      full: 'Inputs and outputs',
    },
  },
  {
    label: 'Subagents and notices',
    how: {
      messages: null,
      steps: 'One line each',
      details: 'With compaction summaries',
      full: 'With compaction summaries',
    },
  },
  {
    label: 'Thinking',
    how: {
      messages: null,
      steps: null,
      details: 'Full text',
      full: 'Full text',
    },
  },
  {
    label: 'Todo lists',
    how: {
      messages: null,
      steps: null,
      details: 'Every step',
      full: 'Every step',
    },
  },
]

export function ExportDialog(props: { session: MachineSession }) {
  const session = props.session
  const clipboard = useCopy()
  const [detail, setDetail] = useState<ExportDetail>('steps')
  const [exports, setExports] = useState<{
    markdown: Record<ExportDetail, string>
    context: ContextUsage | null
  } | null>(null)

  useEffect(() => {
    call(session.machine, 'sessions.export', {
      sessionId: session.id,
      projectId: session.projectId,
    })
      .then(setExports)
      .catch((error: unknown) => {
        showError(error)
        showExport(null)
      })
  }, [session.machine, session.id, session.projectId])

  function save(markdown: string) {
    const name = session.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
    saveBlob(
      new Blob([markdown], { type: 'text/markdown;charset=utf-8' }),
      `${name === '' ? 'chat' : name}.md`
    )
    showExport(null)
  }

  return (
    <Dialog open onOpenChange={() => showExport(null)}>
      <DialogContent
        className="gap-0 overflow-hidden p-0 sm:max-w-md"
        aria-describedby={undefined}
      >
        <DialogHeader className="gap-1 px-6 pt-4 pr-12">
          <div className="flex items-center gap-2">
            <DialogTitle className="text-base">Export to Markdown</DialogTitle>
            {exports !== null && exports.context !== null && (
              <span className="text-muted-foreground rounded-full border px-2 py-0.5 text-xs tabular-nums">
                {compact(exports.context.tokens)}
              </span>
            )}
          </div>
        </DialogHeader>
        <div className="flex flex-col gap-3 px-6 pt-5 pb-6">
          <Slider.Root
            className="relative flex h-5 w-full touch-none items-center select-none"
            min={0}
            max={exportDetails.length - 1}
            step={1}
            value={[exportDetails.indexOf(detail)]}
            onValueChange={(value) => setDetail(exportDetails[value[0]])}
          >
            <Slider.Track className="bg-muted relative h-1.5 grow overflow-hidden rounded-full">
              <Slider.Range className="bg-primary absolute h-full" />
            </Slider.Track>
            <Slider.Thumb
              aria-label="Detail"
              className="border-primary bg-background ring-ring/50 block size-4 rounded-full border-2 shadow-sm transition-shadow hover:ring-4 focus-visible:ring-4 focus-visible:outline-hidden"
            />
          </Slider.Root>
          <div className="relative h-8 text-xs">
            {exportDetails.map((item, index) => (
              <button
                key={item}
                type="button"
                className={cn(
                  'text-muted-foreground hover:text-foreground absolute top-0 flex cursor-pointer flex-col',
                  index === 0 && 'left-0 items-start',
                  index > 0 &&
                    index < exportDetails.length - 1 &&
                    '-translate-x-1/2 items-center',
                  index === exportDetails.length - 1 && 'right-0 items-end',
                  item === detail && 'text-foreground font-medium'
                )}
                style={
                  index > 0 && index < exportDetails.length - 1
                    ? {
                        left: `calc(8px + (100% - 16px) * ${index / (exportDetails.length - 1)})`,
                      }
                    : undefined
                }
                onClick={() => setDetail(item)}
              >
                <span>{levels[item]}</span>
                <span className="text-muted-foreground/70 font-normal tabular-nums">
                  {exports === null
                    ? '…'
                    : `~${compact(tokens(exports.markdown[item]))}`}
                </span>
              </button>
            ))}
          </div>
          <ul className="mt-1 flex flex-col gap-1.5">
            {contents.map((row) => (
              <li key={row.label} className="flex items-center gap-2">
                <HugeiconsIcon
                  icon={row.how[detail] === null ? MinusSignIcon : Tick02Icon}
                  className={cn(
                    'size-4 shrink-0',
                    row.how[detail] === null && 'text-muted-foreground/50',
                    row.how[detail] !== null && 'text-primary'
                  )}
                  strokeWidth={2}
                />
                <span
                  className={cn(
                    'min-w-0 flex-1 truncate',
                    row.how[detail] === null && 'text-muted-foreground/60',
                    row.how[detail] !== null && 'text-foreground'
                  )}
                >
                  {row.label}
                </span>
                <span className="text-muted-foreground shrink-0 text-xs">
                  {row.how[detail] ?? 'Not included'}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <DialogFooter className="bg-muted/40 border-t px-6 py-4 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={() => showExport(null)}
          >
            Cancel
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={exports === null || clipboard.copied}
              onClick={() => {
                if (exports !== null) {
                  void clipboard.copy(exports.markdown[detail])
                }
              }}
            >
              <HugeiconsIcon icon={clipboard.copied ? CheckIcon : CopyIcon} />
              {clipboard.copied ? 'Copied' : 'Copy'}
            </Button>
            <Button
              type="button"
              disabled={exports === null}
              onClick={() => {
                if (exports !== null) {
                  save(exports.markdown[detail])
                }
              }}
            >
              <HugeiconsIcon icon={FileExportIcon} />
              Export
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function tokens(text: string) {
  return Math.round(text.length / 4)
}
