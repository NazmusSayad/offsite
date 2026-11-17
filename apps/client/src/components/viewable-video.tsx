import { PlayIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { lazy, type ReactNode, Suspense, useState } from 'react'
import { duration } from '@/lib/format'
import { cn } from '@/lib/utils'

const FileViewer = lazy(async () => ({
  default: (await import('@/components/file-viewer')).FileViewer,
}))

export function ViewableVideo(props: {
  src: string
  alt: string
  name: string
  size: { width: number; height: number } | null
  actions?: ReactNode
  onError: () => void
}) {
  const [open, setOpen] = useState(false)
  const [length, setLength] = useState<number | null>(null)
  const [measured, setMeasured] = useState<{
    src: string
    size: { width: number; height: number }
  } | null>(null)
  const size =
    props.size ?? (measured?.src === props.src ? measured.size : null)
  const label = props.alt === '' ? props.name : props.alt
  return (
    <>
      <button
        type="button"
        aria-label={`Play ${label}`}
        className={cn(
          'group focus-visible:ring-ring border-border/40 relative block max-w-full cursor-pointer overflow-hidden rounded-lg border bg-black outline-none focus-visible:ring-2',
          size === null && 'aspect-video w-[30rem]'
        )}
        style={
          size === null
            ? undefined
            : {
                width: `min(${size.width}px, 30rem, ${(30 * size.width) / size.height}rem)`,
                aspectRatio: `${size.width} / ${size.height}`,
              }
        }
        onClick={() => setOpen(true)}
      >
        <video
          src={`${props.src}#t=0.001`}
          aria-hidden
          tabIndex={-1}
          muted
          playsInline
          preload="metadata"
          className="pointer-events-none block size-full object-contain"
          onError={props.onError}
          onLoadedMetadata={(event) => {
            const video = event.currentTarget
            setLength(Number.isFinite(video.duration) ? video.duration : null)
            if (video.videoWidth > 0 && video.videoHeight > 0) {
              setMeasured({
                src: props.src,
                size: { width: video.videoWidth, height: video.videoHeight },
              })
            }
          }}
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
          <FileViewer
            name={props.name}
            load={async () => ({ kind: 'video', src: props.src })}
            actions={props.actions}
            onClose={() => setOpen(false)}
          />
        </Suspense>
      )}
    </>
  )
}
