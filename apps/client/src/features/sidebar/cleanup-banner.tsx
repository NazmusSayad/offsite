import { BrushCleaningIcon } from '@hugeicons/core-free-icons'
import { useState } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { CleanupDialog } from '@/features/cleanup/cleanup-dialog'
import { Group } from '@/features/sidebar/service-banner'
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
          <Group
            icon={BrushCleaningIcon}
            tone="border-muted-foreground from-muted-foreground/14 text-muted-foreground"
            label={`Clean up ${fileSize(bytes)}`}
            count={1}
            busy={false}
            open={null}
            onClick={() => setOpen(true)}
          />
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
