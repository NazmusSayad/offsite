import { lazy, type ReactElement, Suspense, useState } from 'react'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card'
import { type Preview, usePreview } from '@/lib/preview'
import { touch } from '@/lib/utils'

const FileViewer = lazy(async () => ({
  default: (await import('@/components/file-viewer')).FileViewer,
}))

const AudioPlayer = lazy(async () => ({
  default: (await import('@/components/audio-player')).AudioPlayer,
}))

const CARD_TEXT_LIMIT = 16 * 1024

export function FilePreview(props: {
  name: string
  load: () => Promise<Preview>
  children: ReactElement
}) {
  const [open, setOpen] = useState(false)
  const [viewing, setViewing] = useState(false)

  function view() {
    setOpen(false)
    setViewing(true)
  }

  return (
    <>
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
            if (touch.matches && !open) {
              setOpen(true)
              return
            }
            view()
          }}
        >
          {props.children}
        </HoverCardTrigger>
        <HoverCardContent
          className="bg-transparent! p-0 shadow-[0_24px_64px_-12px_rgb(0_0_0/60%)] backdrop-filter-none! dark:shadow-[0_24px_64px_-12px_rgb(0_0_0/85%)]"
          onPointerDownOutside={(event) => {
            if (
              event.target instanceof Element &&
              event.target.closest(
                '[data-slot=hover-card-trigger][data-state=open]'
              ) !== null
            ) {
              event.preventDefault()
            }
          }}
        >
          <PreviewCard name={props.name} load={props.load} onView={view} />
        </HoverCardContent>
      </HoverCard>
      {viewing && (
        <Suspense>
          <FileViewer
            name={props.name}
            load={props.load}
            onClose={() => setViewing(false)}
          />
        </Suspense>
      )}
    </>
  )
}

function PreviewCard(props: {
  name: string
  load: () => Promise<Preview>
  onView: () => void
}) {
  const preview = usePreview(props.load)
  if (preview === null) {
    return (
      <p className="bg-popover text-muted-foreground px-3 py-2 text-xs">
        Loading…
      </p>
    )
  }
  if (preview.kind === 'error') {
    return (
      <p className="bg-popover text-muted-foreground max-w-72 px-3 py-2 text-xs wrap-anywhere">
        {preview.message}
      </p>
    )
  }
  if (preview.kind === 'audio') {
    return (
      <Suspense>
        <AudioPlayer src={preview.src} label={props.name} className="w-72" />
      </Suspense>
    )
  }
  return (
    <button
      type="button"
      aria-label={`Open ${props.name}`}
      className="block cursor-zoom-in text-left"
      onClick={props.onView}
    >
      {preview.kind === 'text' && (
        <span className="bg-popover block max-h-80 max-w-[min(32rem,90vw)] overflow-hidden p-3 font-mono text-xs [overflow-wrap:anywhere] whitespace-pre-wrap">
          {preview.text.slice(0, CARD_TEXT_LIMIT)}
        </span>
      )}
      {preview.kind === 'image' && (
        <img
          src={preview.src}
          alt=""
          className="block max-h-[min(30rem,70dvh)] max-w-[min(30rem,90vw)] object-contain"
        />
      )}
      {preview.kind === 'video' && (
        <video
          src={preview.src}
          autoPlay
          muted
          loop
          playsInline
          className="block max-h-[min(30rem,70dvh)] max-w-[min(30rem,90vw)]"
        />
      )}
    </button>
  )
}
