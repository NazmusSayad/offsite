import type { ReactNode } from 'react'
import { FileTypeIcon } from '@/components/file-icon'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'

export function PreviewDialog(props: {
  open: boolean
  onClose: () => void
  onCloseAutoFocus?: (event: Event) => void
  children: ReactNode
}) {
  return (
    <Dialog open={props.open} onOpenChange={() => props.onClose()}>
      <DialogContent
        aria-describedby={undefined}
        className="top-0 left-0 flex h-dvh w-dvw max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:max-w-none"
        onCloseAutoFocus={props.onCloseAutoFocus}
      >
        {props.children}
      </DialogContent>
    </Dialog>
  )
}

export function PreviewHeader(props: { title: string; children?: ReactNode }) {
  return (
    <div className="border-border/60 flex h-11 shrink-0 items-center gap-2 border-b pr-12 pl-4">
      <FileTypeIcon path={props.title} className="size-3.5" />
      <DialogTitle className="min-w-0 truncate font-mono text-xs font-normal">
        {props.title}
      </DialogTitle>
      {props.children}
    </div>
  )
}
