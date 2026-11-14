import { type ReactElement, useEffect, useState } from 'react'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card'
import { errorMessage, touch } from '@/lib/utils'

export type FilePreviewContent =
  | { kind: 'text'; text: string }
  | { kind: 'image' | 'video' | 'audio'; src: string }

export const PREVIEW_TEXT_LIMIT = 16 * 1024

export function FileHoverPreview(props: {
  load: () => Promise<FilePreviewContent>
  children: ReactElement
}) {
  const [open, setOpen] = useState(false)
  return (
    <HoverCard
      open={open}
      onOpenChange={(next) => {
        if (next && touch.matches) {
          return
        }
        setOpen(next)
      }}
      openDelay={150}
      closeDelay={50}
    >
      <HoverCardTrigger
        asChild
        onClick={() => {
          if (touch.matches) {
            setOpen(!open)
          }
        }}
      >
        {props.children}
      </HoverCardTrigger>
      <HoverCardContent className="bg-transparent! p-0 shadow-[0_24px_64px_-12px_rgb(0_0_0/60%)] backdrop-filter-none! dark:shadow-[0_24px_64px_-12px_rgb(0_0_0/85%)]">
        <FilePreview load={props.load} />
      </HoverCardContent>
    </HoverCard>
  )
}

function FilePreview(props: { load: () => Promise<FilePreviewContent> }) {
  const [load] = useState(() => props.load)
  const [preview, setPreview] = useState<
    FilePreviewContent | { kind: 'error'; message: string } | null
  >(null)

  useEffect(() => {
    let current = true
    load().then(
      (loaded) => {
        if (current) {
          setPreview(loaded)
        }
      },
      (caught: unknown) => {
        if (current) {
          setPreview({ kind: 'error', message: errorMessage(caught) })
        }
      }
    )
    return () => {
      current = false
    }
  }, [load])

  if (preview === null) {
    return (
      <p className="bg-popover text-muted-foreground px-3 py-2 text-xs">
        Loading…
      </p>
    )
  }
  if (preview.kind === 'error') {
    return (
      <p className="bg-popover text-muted-foreground max-w-72 px-3 py-2 text-xs">
        {preview.message}
      </p>
    )
  }
  if (preview.kind === 'text') {
    return (
      <pre className="bg-popover max-h-80 max-w-[min(32rem,90vw)] overflow-auto overscroll-contain p-3 font-mono text-xs [overflow-wrap:anywhere] whitespace-pre-wrap">
        {preview.text.slice(0, PREVIEW_TEXT_LIMIT)}
      </pre>
    )
  }
  if (preview.kind === 'image') {
    return (
      <img
        src={preview.src}
        alt=""
        className="block max-h-[min(30rem,70dvh)] max-w-[min(30rem,90vw)] object-contain"
      />
    )
  }
  if (preview.kind === 'video') {
    return (
      <video
        src={preview.src}
        autoPlay
        muted
        loop
        playsInline
        className="block max-h-[min(30rem,70dvh)] max-w-[min(30rem,90vw)]"
      />
    )
  }
  return (
    <div className="bg-popover p-2">
      <audio src={preview.src} controls className="block w-72" />
    </div>
  )
}
