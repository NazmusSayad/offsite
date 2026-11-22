import { UnavailableIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { lazy, Suspense, useState } from 'react'
import { MediaContextMenu } from '@/components/markdown/media-menu'

const AudioPlayer = lazy(async () => ({
  default: (await import('@/components/audio-player')).AudioPlayer,
}))

export function MediaAudio(props: {
  src: string | null
  error: string | null
  alt: string
  name: string
  raw: string
  address: string | null
  local: boolean
}) {
  const [failed, setFailed] = useState<string | null>(null)
  const src = props.src
  if (props.error !== null) {
    return <AudioUnavailable reason={props.error} raw={props.raw} />
  }
  if (src === null) {
    return <span className="my-2 block w-fit max-w-full [&+br]:hidden" />
  }
  if (failed === src) {
    return (
      <span className="my-2 block w-fit max-w-full [&+br]:hidden">
        <AudioUnavailable reason="It could not be loaded" raw={props.raw} />
      </span>
    )
  }
  return (
    <MediaContextMenu
      subject={{
        src,
        kind: 'audio',
        address: props.address,
        local: props.local,
      }}
    >
      <span className="my-2 block w-fit max-w-full [&+br]:hidden">
        <Suspense>
          <AudioPlayer
            src={src}
            label={props.alt === '' ? props.name : props.alt}
            className="flex w-[28rem] max-w-full"
            onError={() => setFailed(src)}
          />
        </Suspense>
      </span>
    </MediaContextMenu>
  )
}

function AudioUnavailable(props: { reason: string; raw: string }) {
  return (
    <span className="border-border/70 text-muted-foreground flex w-fit max-w-full flex-col gap-1 rounded-lg border border-dashed px-3 py-2 text-xs">
      <span className="flex items-start gap-1.5">
        <HugeiconsIcon
          icon={UnavailableIcon}
          aria-hidden
          className="mt-px size-3.5 shrink-0"
        />
        <span>
          <span className="text-foreground/80 font-medium">
            Audio unavailable
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
