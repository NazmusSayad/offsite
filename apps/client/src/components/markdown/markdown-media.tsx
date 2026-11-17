import {
  CheckIcon,
  CopyIcon,
  Download01Icon,
  Image01Icon,
  ImageNotFound01Icon,
  MusicNote01Icon,
  UnavailableIcon,
  Video01Icon,
  VideoOffIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  createContext,
  type CSSProperties,
  lazy,
  Suspense,
  useContext,
  useEffect,
  useState,
} from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { ViewableImage } from '@/components/viewable-image'
import { ViewableVideo } from '@/components/viewable-video'
import { useCopy } from '@/lib/clipboard'
import {
  cachedMediaLink,
  downloadFile,
  githubMediaUrl,
  mediaKind,
  mediaLink,
} from '@/lib/media'
import { type Place, showError, useStore } from '@/lib/store'
import { cn, errorMessage } from '@/lib/utils'

const AudioPlayer = lazy(async () => ({
  default: (await import('@/components/audio-player')).AudioPlayer,
}))

export const GithubRepository = createContext<string | null>(null)

const kindIcons = {
  image: Image01Icon,
  video: Video01Icon,
  audio: MusicNote01Icon,
}

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
  const clipboard = useCopy()
  const [media, setMedia] = useState<
    | {
        path: string
        src: string
        size: { width: number; height: number } | null
      }
    | { path: string; error: string }
    | null
  >(() => {
    const cached =
      selection === null ? null : cachedMediaLink(selection, props.path)
    return cached === null ? null : { path: props.path, ...cached }
  })

  useEffect(() => {
    if (selection === null) {
      return
    }
    if (cachedMediaLink(selection, props.path) !== null) {
      return
    }
    let current = true
    async function load(place: Place, path: string) {
      try {
        const link = await mediaLink(place, path)
        if (current) {
          setMedia({ path, ...link })
        }
      } catch (caught) {
        if (current) {
          setMedia({ path, error: errorMessage(caught) })
        }
      }
    }
    void load(selection, props.path)
    return () => {
      current = false
    }
  }, [selection, props.path])

  const loaded = media !== null && media.path === props.path ? media : null
  if (loaded !== null && 'error' in loaded) {
    return (
      <MediaUnavailable
        kind={mediaKind(props.path) ?? 'image'}
        reason={loaded.error}
        raw={props.raw}
      />
    )
  }
  return (
    <span
      className={cn(
        'border-border bg-muted/50 flex flex-col gap-1 rounded-xl border p-1 my-2 [&+br]:hidden',
        mediaKind(props.path) === 'audio' && 'w-fit max-w-[min(100%,36rem)]',
        mediaKind(props.path) === 'video' && 'w-full max-w-sm',
        (mediaKind(props.path) ?? 'image') === 'image' &&
          'w-fit max-w-full min-w-60'
      )}
    >
      <span className="text-muted-foreground flex items-center gap-1.5 pl-1.5 [contain:inline-size]">
        <HugeiconsIcon
          icon={kindIcons[mediaKind(props.path) ?? 'image']}
          aria-hidden
          className="size-3.5 shrink-0"
        />
        <span
          className="text-2xs min-w-0 flex-1 truncate font-mono"
          title={props.path}
        >
          {props.path}
        </span>
        <span className="flex items-center gap-0.5">
          <Tooltip label={clipboard.copied ? 'Copied' : 'Copy path'}>
            <Button
              type="button"
              variant="ghost-muted"
              size="icon-micro"
              aria-label="Copy path"
              onClick={() => void clipboard.copy(props.path)}
            >
              <HugeiconsIcon
                icon={clipboard.copied ? CheckIcon : CopyIcon}
                className="size-4"
              />
            </Button>
          </Tooltip>
          <Tooltip label="Download">
            <Button
              type="button"
              variant="ghost-muted"
              size="icon-micro"
              aria-label="Download"
              disabled={loaded === null}
              onClick={() => {
                if (loaded === null) {
                  throw new Error('media is still loading')
                }
                void downloadFile(loaded.src, props.path).catch(showError)
              }}
            >
              <HugeiconsIcon icon={Download01Icon} className="size-4" />
            </Button>
          </Tooltip>
        </span>
      </span>
      {loaded !== null && (
        <Media
          src={loaded.src}
          alt={props.alt}
          name={props.path}
          kind={mediaKind(props.path) ?? 'image'}
          raw={props.raw}
          size={loaded.size}
        />
      )}
      {loaded === null && mediaKind(props.path) === 'video' && (
        <span className="border-border/40 block aspect-[3/2] w-full rounded-lg border" />
      )}
      {loaded === null && (mediaKind(props.path) ?? 'image') === 'image' && (
        <span className="bg-muted/60 block aspect-video w-[30rem] max-w-full rounded-lg" />
      )}
    </span>
  )
}

export function GithubMedia(props: {
  url: string
  alt: string
  raw: string
  kind: 'image' | 'video'
  size: CSSProperties | undefined
}) {
  const machine = useStore((state) => state.selection?.machine ?? null)
  const repository = useContext(GithubRepository)
  const [media, setMedia] = useState<
    { url: string; src: string } | { url: string; error: string } | null
  >(null)
  const [failed, setFailed] = useState<string | null>(null)

  useEffect(() => {
    if (machine === null) {
      return
    }
    let current = true
    async function load(target: string, url: string) {
      try {
        const src = await githubMediaUrl(target, url, repository)
        if (current) {
          setMedia({ url, src })
        }
      } catch (caught) {
        if (current) {
          setMedia({ url, error: errorMessage(caught) })
        }
      }
    }
    void load(machine, props.url)
    return () => {
      current = false
    }
  }, [machine, repository, props.url])

  const loaded = media !== null && media.url === props.url ? media : null
  if (loaded !== null && 'error' in loaded) {
    return (
      <MediaUnavailable
        kind={props.kind}
        reason={loaded.error}
        raw={props.raw}
      />
    )
  }
  if (props.kind === 'video') {
    return (
      <span className="my-2 block w-full max-w-sm [&+br]:hidden">
        {loaded === null ? (
          <span className="border-border/40 block aspect-[3/2] w-full rounded-lg border" />
        ) : (
          <Media
            src={loaded.src}
            alt={props.alt}
            name="Video"
            kind="video"
            raw={props.raw}
            size={null}
          />
        )}
      </span>
    )
  }
  if (loaded !== null && failed === loaded.src) {
    return (
      <MediaUnavailable
        kind="image"
        reason="It could not be loaded"
        raw={props.raw}
      />
    )
  }
  if (props.size !== undefined) {
    return loaded === null ? (
      <span className="block max-w-full" style={props.size} />
    ) : (
      <img
        src={loaded.src}
        alt={props.alt}
        loading="lazy"
        decoding="async"
        className="h-auto max-w-full"
        style={props.size}
        onError={() => setFailed(loaded.src)}
      />
    )
  }
  return (
    <span className="my-2 block w-fit max-w-full [&+br]:hidden">
      {loaded === null ? (
        <span className="bg-muted/60 block aspect-video w-[30rem] max-w-full rounded-lg" />
      ) : (
        <Media
          src={loaded.src}
          alt={props.alt}
          name="Image"
          kind="image"
          raw={props.raw}
          size={null}
        />
      )}
    </span>
  )
}

export function Media(props: {
  src: string
  alt: string
  name: string
  kind: 'image' | 'video' | 'audio'
  raw: string
  size: { width: number; height: number } | null
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
        className="block aspect-[3/2] w-full"
        onError={() => setFailed(props.src)}
      />
    )
  }
  if (props.kind === 'audio') {
    return (
      <Suspense>
        <AudioPlayer
          src={props.src}
          label={props.alt === '' ? props.name : props.alt}
          className="flex w-[28rem] max-w-full"
          onError={() => setFailed(props.src)}
        />
      </Suspense>
    )
  }
  return (
    <MarkdownImage
      src={props.src}
      alt={props.alt}
      name={props.name}
      size={props.size}
      onError={() => setFailed(props.src)}
    />
  )
}

function MarkdownImage(props: {
  src: string
  alt: string
  name: string
  size: { width: number; height: number } | null
  onError: () => void
}) {
  const [measured, setMeasured] = useState<{
    src: string
    size: { width: number; height: number }
  } | null>(null)
  const size =
    props.size ?? (measured?.src === props.src ? measured.size : null)

  function measure(image: HTMLImageElement) {
    setMeasured({
      src: props.src,
      size: { width: image.naturalWidth, height: image.naturalHeight },
    })
  }

  if (size !== null) {
    return (
      <ViewableImage
        src={props.src}
        alt={props.alt}
        name={props.name}
        className="block max-w-full overflow-hidden"
        style={{
          width: `min(${size.width}px, 30rem, ${(30 * size.width) / size.height}rem)`,
          aspectRatio: `${size.width} / ${size.height}`,
        }}
        imageClassName="pointer-events-auto block size-full"
        onError={props.onError}
      />
    )
  }
  return (
    <span className="bg-muted/60 relative block aspect-video w-[30rem] max-w-full rounded-lg">
      <img
        ref={(image) => {
          if (image !== null && image.complete && image.naturalWidth > 0) {
            measure(image)
          }
        }}
        src={props.src}
        alt=""
        aria-hidden
        decoding="async"
        className="invisible absolute inset-0 size-full"
        onLoad={(event) => measure(event.currentTarget)}
        onError={props.onError}
      />
    </span>
  )
}

function MediaUnavailable(props: {
  kind: 'image' | 'video' | 'audio'
  reason: string
  raw: string
}) {
  return (
    <span className="border-border/70 text-muted-foreground flex w-fit max-w-full flex-col gap-1 rounded-lg border border-dashed px-3 py-2 text-xs">
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
