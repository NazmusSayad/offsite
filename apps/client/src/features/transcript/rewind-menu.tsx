import {
  ArrowTurnBackwardIcon,
  MoreHorizontalIcon,
  PencilEdit02Icon,
  SourceCodeIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { ItemImage } from '@offsite/core/items'
import type { Provider } from '@offsite/core/providers'
import type { RewindResult } from '@offsite/core/sessions'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
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
import { startChat } from '@/lib/sessions'
import {
  getState,
  projectOf,
  setDraft,
  showError,
  update,
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
    icon: PencilEdit02Icon,
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
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState<{
    mode: RewindMode
    check: { preview: RewindResult; codeError: string | null } | null
  } | null>(null)
  const provider = useStore((state) => state.settings.provider)
  const available = modesFor(provider)
  const stored = useStore((state) => state.prefs.rewind)
  const mode = available.includes(stored) ? stored : 'chat'
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
                size="icon-micro"
                variant="ghost-muted"
                aria-label="Restore options"
                disabled={props.disabled}
              >
                <HugeiconsIcon icon={MoreHorizontalIcon} className="size-4" />
              </Button>
            </DropdownMenuTrigger>
          </Tooltip>
          <DropdownMenuContent align="end" className="w-72">
            <RewindOptions
              messageId={props.target.messageId}
              available={available}
              onPick={(next, check) => setConfirming({ mode: next, check })}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <Tooltip label={modes[mode].label}>
        <Button
          type="button"
          size="icon-micro"
          variant="ghost-muted"
          aria-label={modes[mode].label}
          disabled={props.disabled || busy}
          onClick={() => setConfirming({ mode, check: null })}
        >
          <HugeiconsIcon icon={modes[mode].icon} className="size-4" />
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
            <RewindConfirm
              target={props.target}
              mode={confirming.mode}
              check={confirming.check}
              onBusy={setBusy}
            />
          </AlertDialogContent>
        )}
      </AlertDialog>
    </>
  )
}

function RewindOptions(props: {
  messageId: string
  available: RewindMode[]
  onPick: (
    mode: RewindMode,
    check: { preview: RewindResult; codeError: string | null }
  ) => void
}) {
  const [preview, setPreview] = useState<RewindResult>(null)
  const [codeError, setCodeError] = useState<string | null>(null)
  const messageId = props.messageId
  const selection = useStore((state) => state.selection)
  const machine = selection?.machine ?? null
  const sessionId = selection?.sessionId ?? null
  const projectId = selection?.projectId ?? ''
  const cwd = useStore((state) =>
    machine === null ? '' : (projectOf(state, machine, projectId)?.path ?? '')
  )

  useEffect(() => {
    setPreview(null)
    setCodeError(null)
    if (machine === null || sessionId === null) {
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
  }, [messageId, machine, sessionId, projectId])

  const codeReady = preview !== null && codeError === null
  return (
    <>
      <div className="text-muted-foreground px-2 py-1.5 text-xs">
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
              <span className="text-diff-addition">+{preview.insertions}</span>{' '}
              <span className="text-diff-deletion">−{preview.deletions}</span>)
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
      {props.available.map((option) => (
        <DropdownMenuItem
          key={option}
          disabled={modes[option].code && !codeReady}
          onSelect={() => props.onPick(option, { preview, codeError })}
        >
          <HugeiconsIcon icon={modes[option].icon} />
          {modes[option].label}
        </DropdownMenuItem>
      ))}
    </>
  )
}

function RewindConfirm(props: {
  target: RewindTarget
  mode: RewindMode
  check: { preview: RewindResult; codeError: string | null } | null
  onBusy: (busy: boolean) => void
}) {
  const [preview, setPreview] = useState(
    props.check === null ? null : props.check.preview
  )
  const [codeError, setCodeError] = useState(
    props.check === null ? null : props.check.codeError
  )
  const target = props.target
  const messageId = target.messageId
  const checked = props.check !== null
  const selection = useStore((state) => state.selection)
  const provider = useStore((state) => state.settings.provider)
  const machine = selection?.machine ?? null
  const sessionId = selection?.sessionId ?? null
  const projectId = selection?.projectId ?? ''

  useEffect(() => {
    if (checked || machine === null || sessionId === null) {
      return
    }
    setPreview(null)
    setCodeError(null)
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
  }, [checked, messageId, machine, sessionId, projectId])

  async function apply(next: RewindMode) {
    if (machine === null || sessionId === null) {
      return
    }
    const code = modes[next].code
    const conversation = modes[next].conversation
    props.onBusy(true)
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
      const replace = conversation && target.first && provider === 'claude'
      const truncate = conversation && !replace
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
      if (replace) {
        startChat(machine, projectId, true)
        update({ replacing: { machine, projectId, sessionId } })
      }
      if (conversation) {
        setDraft({ text: target.text, images })
      }
      updatePrefs({ ...getState().prefs, rewind: next })
    } catch (caught) {
      toast(errorMessage(caught))
      showError(caught)
    } finally {
      props.onBusy(false)
    }
  }

  const codeReady = preview !== null && codeError === null
  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>{modes[props.mode].label}?</AlertDialogTitle>
        <AlertDialogDescription>
          {modes[props.mode].description} Do you really want to continue?
          {modes[props.mode].code && codeError !== null && (
            <span className="text-destructive mt-2 block">
              {`Code can't be restored: ${codeError}`}
            </span>
          )}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction
          variant="destructive"
          disabled={modes[props.mode].code && !codeReady}
          onClick={() => void apply(props.mode)}
        >
          {modes[props.mode].label}
        </AlertDialogAction>
      </AlertDialogFooter>
    </>
  )
}
