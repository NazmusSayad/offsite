import { PlayIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { lazy, Suspense, useState } from 'react'
import { duration } from '@/lib/format'
import { cn } from '@/lib/utils'

const VideoViewer = lazy(async () => ({
  default: (await import('@/components/video-viewer')).VideoViewer,
}))

export function ViewableVideo(props: {
  src: string
  alt: string
  name: string
  className?: string
  onError: () => void
}) {
  const [open, setOpen] = useState(false)
  const [length, setLength] = useState<number | null>(null)
  const label = props.alt === '' ? props.name : props.alt
  return (
    <>
      <button
        type="button"
        aria-label={`Play ${label}`}
        className={cn(
          'group focus-visible:ring-ring border-border/40 relative inline-block cursor-pointer overflow-hidden rounded-lg border bg-black align-top outline-none focus-visible:ring-2',
          props.className
        )}
        onClick={() => setOpen(true)}
      >
        <video
          src={`${props.src}#t=0.001`}
          aria-hidden
          tabIndex={-1}
          muted
          playsInline
          preload="metadata"
          className="pointer-events-none block h-auto max-h-[28rem] w-auto max-w-full"
          onError={props.onError}
          onLoadedMetadata={(event) =>
            setLength(
              Number.isFinite(event.currentTarget.duration)
                ? event.currentTarget.duration
                : null
            )
          }
        />
        <span className="absolute inset-0 grid place-items-center bg-black/10 transition-colors group-hover:bg-black/25">
          <span className="grid size-12 place-items-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-transform group-hover:scale-105">
            <HugeiconsIcon
              icon={PlayIcon}
              className="size-5 translate-x-px fill-current"
            />
          </span>
        </span>
        {length !== null && (
          <span className="text-2xs absolute right-2 bottom-2 rounded-md bg-black/60 px-1.5 py-0.5 font-mono text-white tabular-nums">
            {duration(length)}
          </span>
        )}
      </button>
      {open && (
        <Suspense>
          <VideoViewer
            src={props.src}
            label={label}
            name={props.name}
            onClose={() => setOpen(false)}
          />
        </Suspense>
      )}
    </>
  )
}
