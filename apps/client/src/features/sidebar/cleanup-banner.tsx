import { BrushCleaningIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { CleanupDialog } from '@/features/cleanup/cleanup-dialog'
import { fileSize } from '@/lib/format'
import { useStore } from '@/lib/store'

export function CleanupBanner() {
  const bytes = useStore((state) =>
    state.machines.reduce(
      (total, machine) =>
        machine.status === 'online' && machine.cleanup !== null
          ? machine.cleanup.items.reduce((sum, item) => sum + item.bytes, total)
          : total,
      0
    )
  )
  const found = useStore((state) =>
    state.machines.some(
      (machine) =>
        machine.status === 'online' &&
        machine.cleanup !== null &&
        machine.cleanup.items.length > 0
    )
  )
  const [open, setOpen] = useState(false)

  return (
    <>
      {found && (
        <div className="shrink-0 px-(--sidebar-content-inset) pb-(--sidebar-content-inset)">
          <div className="border-muted-foreground from-muted-foreground/14 text-muted-foreground overflow-hidden rounded-r-md border-l-2 bg-linear-to-r to-transparent">
            <button
              type="button"
              className="flex h-8 w-full items-center gap-2 pr-1.5 pl-2.5 text-left transition-colors hover:bg-white/4"
              onClick={() => setOpen(true)}
            >
              <HugeiconsIcon
                icon={BrushCleaningIcon}
                className="size-4 shrink-0"
              />
              <span className="text-sidebar-foreground min-w-0 flex-1 truncate text-[0.8125rem] font-medium">
                Clean up {fileSize(bytes)}
              </span>
            </button>
          </div>
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-lg">
          <CleanupDialog onClose={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  )
}
