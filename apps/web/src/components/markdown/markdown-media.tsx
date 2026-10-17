import {
  ImageNotFound01Icon,
  UnavailableIcon,
  VideoOffIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect, useState } from 'react'
import { ViewableImage } from '@/components/viewable-image'
import { ViewableVideo } from '@/components/viewable-video'
import { mediaKind, mediaUrl } from '@/lib/media'
import { useStore } from '@/lib/store'
import { errorMessage } from '@/lib/utils'

const unavailableIcons = {
  image: ImageNotFound01Icon,
  video: VideoOffIcon,
  audio: UnavailableIcon,
}

const unavailableLabels = {
  image: 'Image unavailable',
  video: 'Video unavailable',
  audio: 'Audio unavailable',
}

export function LocalMedia(props: { path: string; alt: string; raw: string }) {
  const selection = useStore((state) => state.selection)
  const [media, setMedia] = useState<
    { path: string; src: string } | { path: string; error: string } | null
  >(null)

  useEffect(() => {
    if (selection === null) {
      return
    }
    let current = true
    async function load(machine: string, projectId: string, path: string) {
      try {
        const src = await mediaUrl(machine, projectId, path)
        if (current) {
          setMedia({ path, src })
        }
      } catch (caught) {
        if (current) {
          setMedia({ path, error: errorMessage(caught) })
        }
      }
    }
    void load(selection.machine, selection.projectId, props.path)
    return () => {
      current = false
    }
  }, [selection, props.path])

  if (media === null || media.path !== props.path) {
    return null
  }
  if ('error' in media) {
    return (
      <MediaUnavailable
        kind={mediaKind(props.path) ?? 'image'}
        reason={media.error}
        raw={props.raw}
      />
    )
  }
  return (
    <Media
      src={media.src}
      alt={props.alt}
      name={props.path}
      kind={mediaKind(props.path) ?? 'image'}
      raw={props.raw}
    />
  )
}

export function Media(props: {
  src: string
  alt: string
  name: string
  kind: 'image' | 'video' | 'audio'
  raw: string
}) {
  const [failed, setFailed] = useState<string | null>(null)
  if (failed === props.src) {
    return (
      <MediaUnavailable
        kind={props.kind}
        reason="It could not be loaded"
        raw={props.raw}
      />
    )
  }
  if (props.kind === 'video') {
    return (
      <ViewableVideo
        src={props.src}
        alt={props.alt}
        name={props.name}
        className="max-w-[min(100%,36rem)]"
        onError={() => setFailed(props.src)}
      />
    )
  }
  if (props.kind === 'audio') {
    return (
      <audio
        src={props.src}
        aria-label={props.alt}
        controls
        preload="metadata"
        className="inline-block w-full max-w-[min(100%,28rem)] align-top"
        onError={() => setFailed(props.src)}
      />
    )
  }
  return (
    <ViewableImage
      src={props.src}
      alt={props.alt}
      name={props.name}
      className="inline-block max-w-[min(100%,36rem)] align-top"
      imageClassName="border-border/40 h-auto max-h-[28rem] w-auto max-w-full rounded-lg border object-contain"
      onError={() => setFailed(props.src)}
    />
  )
}

function MediaUnavailable(props: {
  kind: 'image' | 'video' | 'audio'
  reason: string
  raw: string
}) {
  return (
    <span className="border-border/70 text-muted-foreground inline-flex max-w-full flex-col gap-1 rounded-lg border border-dashed px-3 py-2 align-top text-xs">
      <span className="flex items-start gap-1.5">
        <HugeiconsIcon
          icon={unavailableIcons[props.kind]}
          aria-hidden
          className="mt-px size-3.5 shrink-0"
        />
        <span>
          <span className="text-foreground/80 font-medium">
            {unavailableLabels[props.kind]}
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
