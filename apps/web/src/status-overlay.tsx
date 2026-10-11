import { BrowserIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@/components/ui/button'
import { clientId, send } from '@/session'

export function StatusOverlay(props: { status: 'connecting' | 'paused' }) {
  return (
    <div className="bg-background/80 animate-in fade-in fixed inset-0 z-50 grid place-items-center p-6 backdrop-blur-md duration-200">
      <div className="flex max-w-xs flex-col items-center gap-6 text-center">
        <span className="relative grid place-items-center">
          <span className="bg-primary/25 animate-breathe absolute size-32 rounded-full blur-3xl motion-reduce:animate-none" />
          <span className="bg-card relative grid size-20 place-items-center rounded-3xl border shadow-2xl">
            {props.status === 'connecting' && (
              <span className="border-foreground/15 border-t-foreground/70 size-8 animate-spin rounded-full border-[3px]" />
            )}
            {props.status === 'paused' && (
              <HugeiconsIcon
                icon={BrowserIcon}
                className="text-foreground/70 size-9"
              />
            )}
          </span>
        </span>
        {props.status === 'connecting' && (
          <div className="grid gap-1.5">
            <p className="text-base font-medium">Connecting</p>
            <p className="text-muted-foreground">
              Your terminals keep running while you wait.
            </p>
          </div>
        )}
        {props.status === 'paused' && (
          <>
            <div className="grid gap-1.5">
              <p className="text-base font-medium">
                sshtty is open in another tab
              </p>
              <p className="text-muted-foreground">
                Only one tab can use it at a time. Your terminals keep running.
              </p>
            </div>
            <Button onClick={() => send({ type: 'resume', clientId })}>
              Use here
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
