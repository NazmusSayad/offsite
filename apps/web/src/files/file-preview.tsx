import { AtIcon, CheckIcon, CopyIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { File } from '@pierre/diffs/react'
import type { FilePreview as Preview } from '@server/protocol'
import { useEffect, useRef, useState } from 'react'
import { FileTypeIcon } from '@/components/file-icon'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { editDraft } from '@/composer/drafts'
import { call } from '@/connection'
import { useCopy } from '@/lib/clipboard'
import { errorMessage } from '@/lib/utils'
import { Markdown } from '@/markdown/markdown'
import { useStore } from '@/store'
import { useCodeTheme } from '@/theme'
import diffCss from '@/git/diff.css?raw'

export function FilePreview(props: {
  cwd: string
  path: string | null
  onClose: () => void
}) {
  const sessionId = useStore((state) => state.selection?.sessionId ?? null)
  const inserted = useRef(false)

  return (
    <Dialog
      open={props.path !== null}
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
    >
      <DialogContent
        aria-describedby={undefined}
        className="flex h-[85dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl"
        onCloseAutoFocus={(event) => {
          if (!inserted.current) return
          inserted.current = false
          event.preventDefault()
          document.querySelector<HTMLElement>('[data-composer]')?.focus()
        }}
      >
        {props.path !== null && (
          <PreviewBody
            key={props.path}
            cwd={props.cwd}
            path={props.path}
            onInsert={(path) => {
              editDraft(sessionId ?? props.cwd, (current) => ({
                ...current,
                text: `${current.text}${/(^|\s)$/.test(current.text) ? '' : ' '}@${path} `,
              }))
              inserted.current = true
              props.onClose()
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function PreviewBody(props: {
  cwd: string
  path: string
  onInsert: (path: string) => void
}) {
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const clipboard = useCopy()
  const codeTheme = useCodeTheme()

  useEffect(() => {
    let current = true
    call('files.read', { cwd: props.cwd, path: props.path }).then(
      (result) => {
        if (current) setPreview(result)
      },
      (caught: unknown) => {
        if (current) setError(errorMessage(caught))
      }
    )
    return () => {
      current = false
    }
  }, [props.cwd, props.path])

  return (
    <>
      <div className="border-border/60 flex h-11 shrink-0 items-center gap-2 border-b pr-12 pl-4">
        <FileTypeIcon path={props.path} className="size-3.5" />
        <DialogTitle className="min-w-0 truncate font-mono text-xs font-normal">
          {props.path}
        </DialogTitle>
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
      </div>
      <div className="min-h-0 flex-1 overflow-auto [--code-background:var(--popover)]">
        {error !== null && (
          <p className="text-muted-foreground p-6 text-center text-xs">
            {error}
          </p>
        )}
        {error === null && preview === null && (
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
        {preview?.kind === 'image' && (
          <div className="grid min-h-full place-items-center p-6">
            <img
              src={`data:${preview.mediaType};base64,${preview.data}`}
              alt={props.path}
              className="max-h-full max-w-full object-contain"
            />
          </div>
        )}
        {preview?.kind === 'text' && /\.(md|markdown)$/i.test(props.path) && (
          <Markdown text={preview.content} className="px-8 py-6" />
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
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
