import { PlayIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@/components/ui/button'
import { clientId, send } from '@/session'

export function StatusOverlay(props: { status: 'connecting' | 'paused' }) {
  if (props.status === 'paused') {
    return (
      <div className="bg-background/85 fixed inset-0 z-50 grid place-items-center backdrop-blur-xs">
        <Button
          variant="ghost"
          className="text-muted-foreground h-auto flex-col gap-3 rounded-2xl px-7 py-5 text-lg font-normal"
          onClick={() => send({ type: 'resume', clientId })}
        >
          <HugeiconsIcon icon={PlayIcon} className="size-16" />
          Continue
        </Button>
      </div>
    )
  }

  return (
    <div className="bg-background/80 animate-in fade-in fixed inset-0 z-50 grid place-items-center p-6 backdrop-blur-md duration-200">
      <div className="flex max-w-xs flex-col items-center gap-6 text-center">
        <span className="relative grid place-items-center">
          <span className="bg-primary/25 animate-breathe absolute size-32 rounded-full blur-3xl motion-reduce:animate-none" />
          <span className="bg-card relative grid size-20 place-items-center rounded-3xl border shadow-2xl">
            <span className="border-foreground/15 border-t-foreground/70 size-8 animate-spin rounded-full border-[3px]" />
          </span>
        </span>
        <div className="grid gap-1.5">
          <p className="text-base font-medium">Connecting</p>
          <p className="text-muted-foreground">
            Your terminals keep running while you wait.
          </p>
        </div>
      </div>
    </div>
  )
}
