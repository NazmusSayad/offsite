import { ArrowDown01Icon, Minimize02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Markdown } from '@/components/markdown/markdown'
import { Tooltip } from '@/components/ui/tooltip'
import { MessageCopyButton } from '@/features/transcript/user-message'
import { clock, fullTime } from '@/lib/format'
import { cn } from '@/lib/utils'

export function CompactionRow(props: {
  summary: string | null
  time: number | null
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <div className="mx-auto w-full max-w-(--chat-content-max-width)">
      <div className="text-muted-foreground flex items-center gap-3 py-1 text-xs">
        <span className="bg-border/70 h-px flex-1" />
        {props.summary === null ? (
          <span className="flex items-center gap-1.5">
            <HugeiconsIcon icon={Minimize02Icon} className="size-3" />
            Conversation compacted
          </span>
        ) : (
          <button
            type="button"
            aria-expanded={props.expanded}
            className="hover:text-foreground flex items-center gap-1.5 transition-colors"
            onClick={props.onToggle}
          >
            <HugeiconsIcon icon={Minimize02Icon} className="size-3" />
            Compacted summary
            <HugeiconsIcon
              icon={ArrowDown01Icon}
              strokeWidth={2.5}
              className={cn(
                'size-3 transition-transform',
                !props.expanded && '-rotate-90'
              )}
            />
          </button>
        )}
        <span className="bg-border/70 h-px flex-1" />
      </div>
      {props.expanded && props.summary !== null && (
        <>
          <div className="bg-muted/40 text-muted-foreground mt-2 rounded-lg border px-4 py-3 text-sm">
            <Markdown text={props.summary} streaming={false} />
          </div>
          <div className="mt-1.5 flex items-center justify-end gap-2 text-xs tabular-nums">
            {props.time !== null && (
              <Tooltip label={fullTime(props.time)}>
                <p className="text-muted-foreground text-xs tabular-nums">
                  {clock(props.time)}
                </p>
              </Tooltip>
            )}
            <MessageCopyButton text={props.summary} />
          </div>
        </>
      )}
    </div>
  )
}
