import { AtIcon, CheckIcon, CopyIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { FilePreview as Preview } from '@offsite/core/protocol'
import { File } from '@pierre/diffs/react'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { call } from '@/api/connection'
import { machineKey } from '@/api/machines'
import { Markdown } from '@/components/markdown/markdown'
import { PreviewDialog, PreviewHeader } from '@/components/preview-dialog'
import { Button } from '@/components/ui/button'
import { editDraft } from '@/features/composer/drafts'
import { useCopy } from '@/lib/clipboard'
import { mediaKind, mediaUrl } from '@/lib/media'
import { useStore } from '@/lib/store'
import { useCodeTheme } from '@/lib/theme'
import { errorMessage } from '@/lib/utils'
import diffCss from '@/features/git/diff.css?raw'

const VideoPlayer = lazy(async () => ({
  default: (await import('@/components/video-player')).VideoPlayer,
}))

const ZoomableImage = lazy(async () => ({
  default: (await import('@/components/zoomable-image')).ZoomableImage,
}))

export function FilePreview(props: {
  machine: string
  projectId: string
  path: string | null
  onClose: () => void
}) {
  const sessionId = useStore((state) => state.selection?.sessionId ?? null)
  const inserted = useRef(false)

  return (
    <PreviewDialog
      open={props.path !== null}
      onClose={props.onClose}
      onCloseAutoFocus={(event) => {
        if (!inserted.current) {
          return
        }
        inserted.current = false
        event.preventDefault()
        document.querySelector<HTMLElement>('[data-composer]')?.focus()
      }}
    >
      {props.path !== null && (
        <PreviewBody
          key={props.path}
          machine={props.machine}
          projectId={props.projectId}
          path={props.path}
          onInsert={(path) => {
            editDraft(
              machineKey(props.machine, sessionId ?? props.projectId),
              (current) => ({
                ...current,
                text: `${current.text}${/(^|\s)$/.test(current.text) ? '' : ' '}@${path} `,
              })
            )
            inserted.current = true
            props.onClose()
          }}
        />
      )}
    </PreviewDialog>
  )
}

function PreviewBody(props: {
  machine: string
  projectId: string
  path: string
  onInsert: (path: string) => void
}) {
  const kind = mediaKind(props.path)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [media, setMedia] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const clipboard = useCopy()
  const codeTheme = useCodeTheme()

  useEffect(() => {
    let current = true
    async function load() {
      try {
        if (kind === null) {
          const result = await call(props.machine, 'files.read', {
            projectId: props.projectId,
            path: props.path,
          })
          if (current) {
            setPreview(result)
          }
          return
        }
        const src = await mediaUrl(props.machine, props.projectId, props.path)
        if (current) {
          setMedia(src)
        }
      } catch (caught) {
        if (current) {
          setError(errorMessage(caught))
        }
      }
    }
    void load()
    return () => {
      current = false
    }
  }, [kind, props.machine, props.projectId, props.path])

  return (
    <>
      <PreviewHeader title={props.path}>
        <Button
          size="icon-sm"
          variant="ghost"
          title={clipboard.copied ? 'Copied' : 'Copy path'}
          aria-label="Copy path"
          onClick={() => void clipboard.copy(props.path)}
        >
          <HugeiconsIcon
            icon={clipboard.copied ? CheckIcon : CopyIcon}
            className="size-3.5"
          />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          title="Insert into message"
          aria-label="Insert into message"
          onClick={() => props.onInsert(props.path)}
        >
          <HugeiconsIcon icon={AtIcon} className="size-3.5" />
        </Button>
        {preview !== null && (
          <span className="text-muted-foreground ml-auto shrink-0 text-xs tabular-nums">
            {formatSize(preview.size)}
          </span>
        )}
      </PreviewHeader>
      <div className="min-h-0 flex-1 overflow-auto [--code-background:var(--popover)]">
        {error !== null && (
          <p className="text-muted-foreground p-6 text-center text-xs">
            {error}
          </p>
        )}
        {error === null && preview === null && media === null && (
          <p className="text-muted-foreground p-6 text-center text-xs">
            Loading…
          </p>
        )}
        {preview?.kind === 'large' && (
          <p className="text-muted-foreground p-6 text-center text-xs">
            This file is {formatSize(preview.size)}, too large to preview (limit{' '}
            {formatSize(preview.limit)}).
          </p>
        )}
        {preview?.kind === 'binary' && (
          <p className="text-muted-foreground p-6 text-center text-xs">
            Binary file ({formatSize(preview.size)}), no preview.
          </p>
        )}
        {media !== null && kind === 'image' && (
          <Suspense>
            <ZoomableImage src={media} alt={props.path} />
          </Suspense>
        )}
        {media !== null && kind === 'video' && (
          <Suspense>
            <VideoPlayer src={media} label={props.path} />
          </Suspense>
        )}
        {media !== null && kind === 'audio' && (
          <div className="grid size-full place-items-center p-6">
            <audio
              src={media}
              aria-label={props.path}
              controls
              preload="metadata"
              className="w-full max-w-md"
            />
          </div>
        )}
        {preview?.kind === 'text' && /\.(md|markdown)$/i.test(props.path) && (
          <Markdown
            text={preview.content}
            className="mx-auto max-w-(--chat-content-max-width) px-8 py-6"
          />
        )}
        {preview?.kind === 'text' && !/\.(md|markdown)$/i.test(props.path) && (
          <File
            file={{ name: props.path, contents: preview.content }}
            options={{
              disableFileHeader: true,
              overflow: 'scroll',
              theme: codeTheme,
              themeType: 'dark',
              unsafeCSS: diffCss,
            }}
          />
        )}
      </div>
    </>
  )
}

function formatSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
