import {
  ArrowTurnBackwardIcon,
  BubbleChatEditIcon,
  MoreHorizontalIcon,
  SourceCodeIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { ItemImage } from '@offsite/core/items'
import type { Provider } from '@offsite/core/providers'
import type { RewindResult } from '@offsite/core/sessions'
import { useEffect, useState } from 'react'
import { call } from '@/api/connection'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip } from '@/components/ui/tooltip'
import type { RewindMode } from '@/lib/prefs'
import { openSession } from '@/lib/sessions'
import {
  getState,
  projectOf,
  setDraft,
  showError,
  updatePrefs,
  useStore,
} from '@/lib/store'
import { errorMessage } from '@/lib/utils'
import { relative } from './tool-details'

export type RewindTarget = {
  messageId: string
  text: string
  images: ItemImage[]
  first: boolean
}

const modes = {
  all: {
    label: 'Restore code and chat',
    description:
      'This will undo file changes made since this message and remove this message and everything after it from the chat.',
    icon: ArrowTurnBackwardIcon,
    code: true,
    conversation: true,
  },
  chat: {
    label: 'Restore chat',
    description:
      'This will remove this message and everything after it from the chat. Files will not change.',
    icon: BubbleChatEditIcon,
    code: false,
    conversation: true,
  },
  code: {
    label: 'Restore code',
    description:
      'This will undo file changes made since this message. The chat will not change.',
    icon: SourceCodeIcon,
    code: true,
    conversation: false,
  },
}

function modesFor(provider: Provider): RewindMode[] {
  if (provider === 'claude') {
    return ['all', 'chat', 'code']
  }
  if (provider === 'opencode') {
    return ['all', 'chat']
  }
  if (provider === 'codex') {
    return ['chat']
  }
  throw new Error(`unknown provider ${provider}`)
}

export function RewindMenu(props: { target: RewindTarget; disabled: boolean }) {
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState<RewindResult>(null)
  const [codeError, setCodeError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState<RewindMode | null>(null)
  const target = props.target
  const messageId = target.messageId
  const selection = useStore((state) => state.selection)
  const provider = useStore((state) => state.settings.provider)
  const available = modesFor(provider)
  const stored = useStore((state) => state.prefs.rewind)
  const mode = available.includes(stored) ? stored : 'chat'
  const machine = selection?.machine ?? null
  const sessionId = selection?.sessionId ?? null
  const projectId = selection?.projectId ?? ''
  const cwd = useStore((state) =>
    machine === null ? '' : (projectOf(state, machine, projectId)?.path ?? '')
  )

  useEffect(() => {
    setPreview(null)
    setCodeError(null)
    if (!open || machine === null || sessionId === null) {
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
  }, [open, messageId, machine, sessionId, projectId])

  async function apply(next: RewindMode) {
    if (machine === null || sessionId === null) {
      return
    }
    const { code, conversation } = modes[next]
    setBusy(true)
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
      updatePrefs({ ...getState().prefs, rewind: next })
      setOpen(false)
    } catch (caught) {
      showError(caught)
    } finally {
      setBusy(false)
    }
  }

  const codeReady = preview !== null && codeError === null
  return (
    <>
      {available.length > 1 && (
        <DropdownMenu
          open={open}
          onOpenChange={(next) => {
            if (!busy) {
              setOpen(next)
            }
          }}
        >
          <Tooltip label="Restore options">
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="icon-xs"
                variant="ghost-muted"
                aria-label="Restore options"
                disabled={props.disabled}
              >
                <HugeiconsIcon icon={MoreHorizontalIcon} className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
          </Tooltip>
          <DropdownMenuContent align="end" className="w-72">
            <div className="text-muted-foreground px-2 py-1.5 text-xs">
              {codeError !== null && `Code can't be restored: ${codeError}`}
              {codeError === null &&
                preview === null &&
                'Checking file changes…'}
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
            <DropdownMenuSeparator />
            {available.map((option) => (
              <DropdownMenuItem
                key={option}
                disabled={busy || (modes[option].code && !codeReady)}
                onSelect={() => setConfirming(option)}
              >
                <HugeiconsIcon icon={modes[option].icon} />
                {modes[option].label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <Tooltip label={modes[mode].label}>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost-muted"
          aria-label={modes[mode].label}
          disabled={props.disabled || busy}
          onClick={() => setConfirming(mode)}
        >
          <HugeiconsIcon icon={modes[mode].icon} className="size-3.5" />
        </Button>
      </Tooltip>
      <AlertDialog
        open={confirming !== null}
        onOpenChange={(next) => {
          if (!next) {
            setConfirming(null)
          }
        }}
      >
        {confirming !== null && (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{modes[confirming].label}?</AlertDialogTitle>
              <AlertDialogDescription>
                {modes[confirming].description} Do you really want to continue?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => void apply(confirming)}
              >
                {modes[confirming].label}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </>
  )
}
