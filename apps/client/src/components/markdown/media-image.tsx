import { ImageNotFound01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { type CSSProperties, useState } from 'react'
import {
  MediaContextMenu,
  type MediaSubject,
  MediaViewerActions,
} from '@/components/markdown/media-menu'
import { ViewableImage } from '@/components/viewable-image'

export function MediaImage(props: {
  src: string | null
  error: string | null
  alt: string
  name: string
  raw: string
  size: { width: number; height: number } | null
  address: string | null
  local: boolean
}) {
  const [failed, setFailed] = useState<string | null>(null)
  const [measured, setMeasured] = useState<{
    src: string
    size: { width: number; height: number }
  } | null>(null)
  const src = props.src
  if (props.error !== null) {
    return <ImageUnavailable reason={props.error} raw={props.raw} />
  }
  if (src === null) {
    return (
      <span className="my-2 block w-fit max-w-full [&+br]:hidden">
        <span className="bg-muted/60 block aspect-video w-[30rem] max-w-full rounded-lg" />
      </span>
    )
  }
  if (failed === src) {
    return (
      <span className="my-2 block w-fit max-w-full [&+br]:hidden">
        <ImageUnavailable reason="It could not be loaded" raw={props.raw} />
      </span>
    )
  }
  const subject: MediaSubject = {
    src,
    kind: 'image',
    address: props.address,
    local: props.local,
  }
  const size = props.size ?? (measured?.src === src ? measured.size : null)

  function measure(image: HTMLImageElement, source: string) {
    setMeasured({
      src: source,
      size: { width: image.naturalWidth, height: image.naturalHeight },
    })
  }

  return (
    <MediaContextMenu subject={subject}>
      <span className="my-2 block w-fit max-w-full [&+br]:hidden">
        {size === null ? (
          <span className="bg-muted/60 relative block aspect-video w-[30rem] max-w-full rounded-lg">
            <img
              ref={(image) => {
                if (
                  image !== null &&
                  image.complete &&
                  image.naturalWidth > 0
                ) {
                  measure(image, src)
                }
              }}
              src={src}
              alt=""
              aria-hidden
              decoding="async"
              className="invisible absolute inset-0 size-full"
              onLoad={(event) => measure(event.currentTarget, src)}
              onError={() => setFailed(src)}
            />
          </span>
        ) : (
          <ViewableImage
            src={src}
            alt={props.alt}
            name={props.name}
            className="block max-w-full overflow-hidden"
            style={{
              width: `min(${size.width}px, 30rem, ${(30 * size.width) / size.height}rem)`,
              aspectRatio: `${size.width} / ${size.height}`,
            }}
            imageClassName="pointer-events-auto block size-full"
            actions={<MediaViewerActions subject={subject} />}
            onError={() => setFailed(src)}
          />
        )}
      </span>
    </MediaContextMenu>
  )
}

export function MediaSizedImage(props: {
  src: string | null
  error: string | null
  alt: string
  raw: string
  style: CSSProperties
}) {
  const [failed, setFailed] = useState<string | null>(null)
  const src = props.src
  if (props.error !== null) {
    return <ImageUnavailable reason={props.error} raw={props.raw} />
  }
  if (src === null) {
    return <span className="block max-w-full" style={props.style} />
  }
  if (failed === src) {
    return <ImageUnavailable reason="It could not be loaded" raw={props.raw} />
  }
  return (
    <img
      src={src}
      alt={props.alt}
      loading="lazy"
      decoding="async"
      className="h-auto max-w-full"
      style={props.style}
      onError={() => setFailed(src)}
    />
  )
}

export function MediaInlineImage(props: {
  src: string
  alt: string
  style: CSSProperties | undefined
}) {
  return (
    <img
      src={props.src}
      alt={props.alt}
      loading="lazy"
      decoding="async"
      className="max-h-[30rem] max-w-full object-contain"
      style={props.style}
    />
  )
}

function ImageUnavailable(props: { reason: string; raw: string }) {
  return (
    <span className="border-border/70 text-muted-foreground flex w-fit max-w-full flex-col gap-1 rounded-lg border border-dashed px-3 py-2 text-xs">
      <span className="flex items-start gap-1.5">
        <HugeiconsIcon
          icon={ImageNotFound01Icon}
          aria-hidden
          className="mt-px size-3.5 shrink-0"
        />
        <span>
          <span className="text-foreground/80 font-medium">
            Image unavailable
          </span>
          {` · ${props.reason}`}
        </span>
      </span>
      <span className="text-2xs font-mono break-all opacity-80">
        {props.raw}
      </span>
    </span>
  )
}
