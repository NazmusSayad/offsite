import { ArrowUp02Icon, ListPlusIcon, XIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@/components/ui/button'
import { steer, unqueue } from '@/lib/sessions'
import { useStore } from '@/lib/store'

export function QueuedMessages() {
  const queue = useStore((state) => state.queue)

  return (
    <div className="composer-glass relative mx-auto -mb-[calc(1rem+1px)] w-[calc(100%-2.75rem)] rounded-t-2xl border border-b-0 border-(--composer-outline) px-1 pt-1 pb-[calc(1rem+1px+0.25rem)] text-xs/4">
      {queue.map((item) => (
        <div
          key={item.id}
          className="grid min-h-6 grid-cols-[1.5rem_minmax(0,1fr)_auto_auto] items-center gap-x-1"
        >
          <HugeiconsIcon
            icon={ListPlusIcon}
            className="text-muted-foreground mx-auto size-3"
          />
          <span className="text-secondary-label truncate">
            {item.prompt.text === ''
              ? `${item.prompt.images.length} image(s)`
              : item.prompt.text}
          </span>
          <Button
            variant="ghost-muted"
            size="icon-xs"
            title="Send now"
            onClick={() => steer(item.id)}
          >
            <HugeiconsIcon icon={ArrowUp02Icon} />
          </Button>
          <Button
            variant="ghost-muted"
            size="icon-xs"
            title="Remove from queue"
            onClick={() => unqueue(item.id)}
          >
            <HugeiconsIcon icon={XIcon} />
          </Button>
        </div>
      ))}
    </div>
  )
}
