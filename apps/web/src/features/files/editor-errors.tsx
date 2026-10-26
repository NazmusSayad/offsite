import { AlertCircleIcon, XIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { dismissErrors, useStore } from '@/lib/store'

export function EditorErrors() {
  const errors = useStore((state) => state.errors)
  if (errors.length === 0) {
    return null
  }
  return (
    <div
      role="alert"
      className="bg-popover text-popover-foreground absolute right-3 bottom-9 z-20 flex w-96 max-w-[calc(100%-1.5rem)] items-start gap-2 rounded-md border p-3 text-[13px] shadow-lg"
    >
      <HugeiconsIcon
        icon={AlertCircleIcon}
        className="text-destructive mt-0.5 size-4 shrink-0"
      />
      <p className="min-w-0 flex-1 break-words whitespace-pre-wrap">
        {errors.at(-1)}
      </p>
      <button
        type="button"
        title="Dismiss"
        aria-label="Dismiss"
        className="hover:bg-accent grid size-5 shrink-0 cursor-pointer place-items-center rounded-sm"
        onClick={dismissErrors}
      >
        <HugeiconsIcon icon={XIcon} className="size-3.5" />
      </button>
    </div>
  )
}
