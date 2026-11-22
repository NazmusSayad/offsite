import {
  FullScreenIcon,
  ReloadIcon,
  UnavailableIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'
import { LanguageIcon } from '@/components/markdown/language-icon'
import {
  type MediaSubject,
  MediaViewerActions,
} from '@/components/markdown/media-menu'
import { PreviewDialog, PreviewHeader } from '@/components/preview-dialog'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'

export function MediaHtml(props: {
  src: string | null
  error: string | null
  alt: string
  name: string
  raw: string
}) {
  const [reloadedAt, setReloadedAt] = useState<number | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  if (props.error !== null) {
    return <HtmlUnavailable reason={props.error} raw={props.raw} />
  }
  const title =
    props.alt === ''
      ? props.name.slice(props.name.lastIndexOf('/') + 1)
      : props.alt
  const src = props.src
  return (
    <span className="border-border/60 my-2 flex h-[min(30rem,70dvh)] w-full flex-col overflow-hidden rounded-lg border [&+br]:hidden">
      <span className="border-border/60 flex h-10 shrink-0 items-center gap-2 border-b pr-1 pl-3">
        <LanguageIcon language="html" />
        <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
          {title}
        </span>
        {src !== null && (
          <span className="flex items-center gap-1">
            <ReloadButton onClick={() => setReloadedAt(Date.now())} />
            <MediaViewerActions subject={htmlSubject(src, props.name)} />
            <Tooltip label="Fullscreen" side="bottom">
              <Button
                type="button"
                variant="ghost-muted"
                size="icon-sm"
                aria-label="Fullscreen"
                onClick={() => setFullscreen(true)}
              >
                <HugeiconsIcon icon={FullScreenIcon} className="size-4" />
              </Button>
            </Tooltip>
          </span>
        )}
      </span>
      {src === null ? (
        <span className="bg-muted/60 block min-h-0 flex-1" />
      ) : (
        <span className="relative block min-h-0 flex-1">
          <span className="absolute inset-px rounded-b-lg bg-white" />
          <iframe
            src={reloadedSrc(src, reloadedAt)}
            title={title}
            sandbox="allow-scripts allow-forms allow-popups"
            className="relative block size-full rounded-b-lg scheme-light"
          />
        </span>
      )}
      {fullscreen && src !== null && (
        <HtmlViewer
          src={src}
          reloadedAt={reloadedAt}
          name={props.name}
          title={title}
          onClose={() => setFullscreen(false)}
        />
      )}
    </span>
  )
}

function HtmlViewer(props: {
  src: string
  reloadedAt: number | null
  name: string
  title: string
  onClose: () => void
}) {
  const [reloadedAt, setReloadedAt] = useState(props.reloadedAt)
  return (
    <PreviewDialog open onClose={props.onClose}>
      <PreviewHeader
        title={props.title}
        icon={<LanguageIcon language="html" />}
      >
        <span className="ml-auto flex items-center gap-1">
          <ReloadButton onClick={() => setReloadedAt(Date.now())} />
          <MediaViewerActions subject={htmlSubject(props.src, props.name)} />
        </span>
      </PreviewHeader>
      <iframe
        src={reloadedSrc(props.src, reloadedAt)}
        title={props.title}
        sandbox="allow-scripts allow-forms allow-popups"
        className="min-h-0 w-full flex-1 bg-white scheme-light"
      />
    </PreviewDialog>
  )
}

function ReloadButton(props: { onClick: () => void }) {
  return (
    <Tooltip label="Reload" side="bottom">
      <Button
        type="button"
        variant="ghost-muted"
        size="icon-sm"
        aria-label="Reload"
        onClick={props.onClick}
      >
        <HugeiconsIcon icon={ReloadIcon} className="size-4" />
      </Button>
    </Tooltip>
  )
}

function htmlSubject(src: string, path: string): MediaSubject {
  return { src, kind: 'html', address: path, local: true }
}

function reloadedSrc(src: string, reloadedAt: number | null) {
  return reloadedAt === null ? src : `${src}&reload=${reloadedAt}`
}

function HtmlUnavailable(props: { reason: string; raw: string }) {
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
            Page unavailable
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
