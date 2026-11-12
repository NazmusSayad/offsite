import { useState } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { needsSetup, SetupPanel } from '@/features/setup/setup-dialog'
import { useStore } from '@/lib/store'

export function ServiceBanners() {
  const count = useStore((state) => state.machines.filter(needsSetup).length)
  const [open, setOpen] = useState(false)
  if (count === 0) {
    return null
  }

  return (
    <div className="flex shrink-0 flex-col px-(--sidebar-content-inset) pb-(--sidebar-content-inset)">
      <button
        type="button"
        className="border-primary/50 bg-primary/15 text-sidebar-foreground hover:bg-primary/25 flex h-9 items-center justify-center rounded-lg border px-3 text-sm font-medium transition-colors"
        onClick={() => setOpen(true)}
      >
        {count === 1 ? '1 thing to set up' : `${count} things to set up`}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          aria-describedby={undefined}
          className="flex h-[min(36rem,calc(100dvh-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl sm:flex-row"
        >
          <SetupPanel onClose={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  )
}
