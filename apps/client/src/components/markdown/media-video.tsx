import { VideoOffIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'
import {
  MediaContextMenu,
  type MediaSubject,
  MediaViewerActions,
} from '@/components/markdown/media-menu'
import { ViewableVideo } from '@/components/viewable-video'

export function MediaVideo(props: {
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
  const src = props.src
  if (props.error !== null) {
    return <VideoUnavailable reason={props.error} raw={props.raw} />
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
        <VideoUnavailable reason="It could not be loaded" raw={props.raw} />
      </span>
    )
  }
  const subject: MediaSubject = {
    src,
    kind: 'video',
    address: props.address,
    local: props.local,
  }
  return (
    <MediaContextMenu subject={subject}>
      <span className="my-2 block w-fit max-w-full [&+br]:hidden">
        <ViewableVideo
          src={src}
          alt={props.alt}
          name={props.name}
          size={props.size}
          actions={<MediaViewerActions subject={subject} />}
          onError={() => setFailed(src)}
        />
      </span>
    </MediaContextMenu>
  )
}

function VideoUnavailable(props: { reason: string; raw: string }) {
  return (
    <span className="border-border/70 text-muted-foreground flex w-fit max-w-full flex-col gap-1 rounded-lg border border-dashed px-3 py-2 text-xs">
      <span className="flex items-start gap-1.5">
        <HugeiconsIcon
          icon={VideoOffIcon}
          aria-hidden
          className="mt-px size-3.5 shrink-0"
        />
        <span>
          <span className="text-foreground/80 font-medium">
            Video unavailable
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
