import { PencilEdit02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { ItemImage } from '@offsite/core/items'
import type { RewindResult } from '@offsite/core/sessions'
import { useEffect, useState } from 'react'
import { call } from '@/api/connection'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip } from '@/components/ui/tooltip'
import { openSession } from '@/lib/sessions'
import { getState, projectOf, setDraft, useStore } from '@/lib/store'
import { errorMessage } from '@/lib/utils'
import { relative } from './tool-details'

export type RewindTarget = {
  messageId: string
  text: string
  images: ItemImage[]
  first: boolean
}

export function RewindMenu(props: { target: RewindTarget; disabled: boolean }) {
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState<RewindResult>(null)
  const [codeError, setCodeError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const target = props.target
  const messageId = target.messageId
  const selection = useStore((state) => state.selection)
  const provider = useStore((state) => state.settings.provider)
  const restoresCode = provider !== 'codex'
  const machine = selection?.machine ?? null
  const sessionId = selection?.sessionId ?? null
  const projectId = selection?.projectId ?? ''
  const cwd = useStore((state) =>
    machine === null ? '' : (projectOf(state, machine, projectId)?.path ?? '')
  )

  useEffect(() => {
    setPreview(null)
    setCodeError(null)
    setError(null)
    if (!open || machine === null || sessionId === null || !restoresCode) {
      return
    }
    let current = true
    call(machine, 'sessions.rewind', {
      sessionId,
      projectId,
      messageId,
      settings: getState().settings,
      code: true,
      conversation: false,
      dryRun: true,
    }).then(
      (result) => {
        if (current) {
          setPreview(result)
        }
      },
      (caught: unknown) => {
        if (current) {
          setCodeError(errorMessage(caught))
        }
      }
    )
    return () => {
      current = false
    }
  }, [open, messageId, machine, sessionId, projectId, restoresCode])

  async function apply(code: boolean, conversation: boolean) {
    if (machine === null || sessionId === null) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      const images = conversation
        ? await Promise.all(
            target.images.map((image, index) =>
              image.data === null
                ? call(machine, 'sessions.image', {
                    sessionId,
                    itemId: target.messageId,
                    index,
                  })
                : { mediaType: image.mediaType, data: image.data }
            )
          )
        : []
      const truncate =
        conversation && (!target.first || provider === 'opencode')
      if (code || truncate) {
        await call(machine, 'sessions.rewind', {
          sessionId,
          projectId,
          messageId: target.messageId,
          settings: getState().settings,
          code,
          conversation: truncate,
          dryRun: false,
        })
      }
      if (conversation && target.first && provider !== 'opencode') {
        openSession({ machine, projectId, sessionId: null })
      }
      if (conversation) {
        setDraft({ text: target.text, images })
      }
      setOpen(false)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  const codeReady = preview !== null && codeError === null
  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        if (!busy) {
          setOpen(next)
        }
      }}
    >
      <Tooltip label="Edit from here">
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost-muted"
            aria-label="Edit from here"
            disabled={props.disabled}
          >
            <HugeiconsIcon icon={PencilEdit02Icon} className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Edit from this message</DropdownMenuLabel>
        {restoresCode && (
          <div className="text-muted-foreground px-2 pb-1.5 text-xs">
            {codeError !== null && `Code can't be restored: ${codeError}`}
            {codeError === null && preview === null && 'Checking file changes…'}
            {preview !== null &&
              preview.files.length === 0 &&
              'No file changes since this message.'}
            {preview !== null && preview.files.length > 0 && (
              <>
                <div>
                  Restores {preview.files.length}{' '}
                  {preview.files.length === 1 ? 'file' : 'files'} (
                  <span className="text-diff-addition">
                    +{preview.insertions}
                  </span>{' '}
                  <span className="text-diff-deletion">
                    −{preview.deletions}
                  </span>
                  )
                </div>
                <ul className="mt-1 max-h-24 overflow-y-auto font-mono">
                  {preview.files.map((file) => (
                    <li key={file} className="truncate">
                      {relative(file, cwd)}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
        <DropdownMenuSeparator />
        {restoresCode && (
          <DropdownMenuItem
            disabled={busy || !codeReady}
            onSelect={(event) => {
              event.preventDefault()
              void apply(true, true)
            }}
          >
            Restore code and conversation
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          disabled={busy}
          onSelect={(event) => {
            event.preventDefault()
            void apply(false, true)
          }}
        >
          {restoresCode ? 'Restore conversation only' : 'Restore conversation'}
        </DropdownMenuItem>
        {provider === 'claude' && (
          <DropdownMenuItem
            disabled={busy || !codeReady}
            onSelect={(event) => {
              event.preventDefault()
              void apply(true, false)
            }}
          >
            Restore code only
          </DropdownMenuItem>
        )}
        {error !== null && (
          <p className="text-destructive px-2 py-1.5 text-xs">{error}</p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
