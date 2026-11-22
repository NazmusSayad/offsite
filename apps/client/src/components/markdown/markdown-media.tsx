import { isHtmlPath } from '@offsite/core/media'
import {
  createContext,
  type CSSProperties,
  useContext,
  useEffect,
  useState,
} from 'react'
import { MediaAudio } from '@/components/markdown/media-audio'
import { MediaHtml } from '@/components/markdown/media-html'
import { MediaImage, MediaSizedImage } from '@/components/markdown/media-image'
import { MediaVideo } from '@/components/markdown/media-video'
import {
  cachedMediaLink,
  cacheMediaLink,
  githubMediaUrl,
  type MediaLink,
  mediaFolder,
  mediaKind,
  mediaLink,
} from '@/lib/media'
import { type Place, useStore } from '@/lib/store'
import { errorMessage } from '@/lib/utils'

export const GithubRepository = createContext<string | null>(null)
export const MediaMessage = createContext<{
  id: string | null
  reply: boolean
}>({ id: null, reply: false })

export function LocalMedia(props: { path: string; alt: string; raw: string }) {
  const selection = useStore((state) => state.selection)
  const message = useContext(MediaMessage)
  const id = message.id
  const kind =
    message.reply && isHtmlPath(props.path)
      ? 'html'
      : (mediaKind(props.path) ?? 'image')
  const [media, setMedia] = useState<
    { path: string; link: MediaLink } | { path: string; error: string } | null
  >(() => {
    const cached =
      selection === null || id === null
        ? null
        : cachedMediaLink(selection, id, props.path)
    return cached === null ? null : { path: props.path, link: cached }
  })
  const loaded = media !== null && media.path === props.path ? media : null
  const link = loaded !== null && 'link' in loaded ? loaded.link : null
  const folderLink =
    selection !== null && link?.folder === mediaFolder(selection) ? link : null

  useEffect(() => {
    if (selection === null || folderLink !== null) {
      return
    }
    let current = true
    async function load(place: Place, path: string) {
      try {
        const next = await mediaLink(place, path)
        if (current) {
          setMedia({ path, link: next })
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
  }, [selection, props.path, folderLink])

  useEffect(() => {
    if (selection !== null && id !== null && folderLink !== null) {
      cacheMediaLink(selection, id, props.path, folderLink)
    }
  }, [selection, id, props.path, folderLink])

  const shown = {
    src: link?.src ?? null,
    error: loaded !== null && 'error' in loaded ? loaded.error : null,
    alt: props.alt,
    name: props.path,
    raw: props.raw,
  }
  switch (kind) {
    case 'html':
      return <MediaHtml {...shown} />
    case 'image':
      return (
        <MediaImage
          {...shown}
          size={link?.size ?? null}
          address={props.path}
          local
        />
      )
    case 'video':
      return (
        <MediaVideo
          {...shown}
          size={link?.size ?? null}
          address={props.path}
          local
        />
      )
    case 'audio':
      return <MediaAudio {...shown} address={props.path} local />
  }
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
  const shown = {
    src: loaded !== null && 'src' in loaded ? loaded.src : null,
    error: loaded !== null && 'error' in loaded ? loaded.error : null,
    alt: props.alt,
    raw: props.raw,
  }
  switch (props.kind) {
    case 'image':
      return props.size === undefined ? (
        <MediaImage
          {...shown}
          name="Image"
          size={null}
          address={props.url}
          local={false}
        />
      ) : (
        <MediaSizedImage {...shown} style={props.size} />
      )
    case 'video':
      return (
        <MediaVideo
          {...shown}
          name="Video"
          size={null}
          address={props.url}
          local={false}
        />
      )
  }
}

export function RemoteMedia(props: { src: string; alt: string; raw: string }) {
  const embedded = props.src.startsWith('data:')
  const shown = {
    src: props.src,
    error: null,
    alt: props.alt,
    name: embedded ? 'Image' : props.src.split(/[?#]/)[0],
    raw: props.raw,
    address: embedded ? null : props.src,
    local: false,
  }
  const kind = mediaKind(props.src) ?? 'image'
  switch (kind) {
    case 'image':
      return <MediaImage {...shown} size={null} />
    case 'video':
      return <MediaVideo {...shown} size={null} />
    case 'audio':
      return <MediaAudio {...shown} />
  }
}
