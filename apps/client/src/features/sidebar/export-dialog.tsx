import { type ExportDetail, exportDetails } from '@offsite/core/sessions'
import { Slider } from 'radix-ui'
import { useEffect, useState } from 'react'
import { call } from '@/api/connection'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { compact } from '@/lib/format'
import { saveBlob } from '@/lib/media'
import { type MachineSession, showError, showExport } from '@/lib/store'
import { cn } from '@/lib/utils'

const levels: Record<ExportDetail, { label: string; description: string }> = {
  messages: {
    label: 'Messages',
    description:
      'Only your messages and the agent’s replies, plans and answers.',
  },
  steps: {
    label: 'Steps',
    description:
      'Adds one line for each command, edit and tool the agent used.',
  },
  details: {
    label: 'Details',
    description: 'Adds thinking, full commands, diffs and tool inputs.',
  },
  full: {
    label: 'Everything',
    description:
      'Adds the output of every command and tool. The file can get large.',
  },
}

export function ExportDialog(props: { session: MachineSession }) {
  const session = props.session
  const [detail, setDetail] = useState<ExportDetail>('steps')
  const [exports, setExports] = useState<Record<ExportDetail, string> | null>(
    null
  )

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
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="gap-1 px-6 pt-4 pr-12">
          <DialogTitle className="text-base">Export to Markdown</DialogTitle>
          <DialogDescription className="truncate">
            {props.session.title}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 px-6 pt-5 pb-6">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-foreground font-medium">Detail</span>
            <span className="text-muted-foreground text-xs tabular-nums">
              {exports === null
                ? 'Counting tokens…'
                : `About ${tokens(exports[detail]).toLocaleString()} tokens`}
            </span>
          </div>
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
                <span>{levels[item].label}</span>
                <span className="text-muted-foreground/70 font-normal tabular-nums">
                  {exports === null
                    ? '…'
                    : `~${compact(tokens(exports[item]))}`}
                </span>
              </button>
            ))}
          </div>
          <p className="text-muted-foreground min-h-10">
            {levels[detail].description}
          </p>
        </div>
        <DialogFooter className="bg-muted/40 border-t px-6 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => showExport(null)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={exports === null}
            onClick={() => {
              if (exports !== null) {
                save(exports[detail])
              }
            }}
          >
            Export
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function tokens(text: string) {
  return Math.round(text.length / 4)
}
