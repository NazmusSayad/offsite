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
    icon: ArrowTurnBackwardIcon,
    code: true,
  },
  chat: {
    label: 'Restore chat',
    icon: PencilEdit02Icon,
    code: false,
  },
  code: {
    label: 'Restore code',
    description:
      'This will undo file changes made since this message. The chat will not change.',
    icon: SourceCodeIcon,
    code: true,
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
  const [confirming, setConfirming] = useState<{ checked: boolean } | null>(
    null
  )
  const provider = useStore((state) => state.settings.provider)
  const available = modesFor(provider)
  const stored = useStore((state) => state.prefs.rewind)
  const mode = available.includes(stored) ? stored : 'chat'

  async function pick(next: RewindMode, checked: boolean) {
    if (next === 'code') {
      setConfirming({ checked })
      return
    }
    setBusy(true)
    try {
      await editMessage(props.target, next)
    } catch (caught) {
      toast(errorMessage(caught))
      showError(caught)
    } finally {
      setBusy(false)
    }
  }

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
              onPick={(next) => void pick(next, true)}
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
          onClick={() => void pick(mode, false)}
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
              checked={confirming.checked}
              onBusy={setBusy}
            />
          </AlertDialogContent>
        )}
      </AlertDialog>
    </>
  )
}

async function editMessage(target: RewindTarget, mode: 'all' | 'chat') {
  const selection = getState().selection
  if (selection === null || selection.sessionId === null) {
    return
  }
  const sessionId = selection.sessionId
  const images = await Promise.all(
    target.images.map((image, index) =>
      image.data === null
        ? call(selection.machine, 'sessions.image', {
            sessionId,
            itemId: target.messageId,
            index,
          })
        : { mediaType: image.mediaType, data: image.data }
    )
  )
  setDraft({ text: target.text, images })
  update({
    rewinding: { messageId: target.messageId, mode, first: target.first },
  })
  updatePrefs({ ...getState().prefs, rewind: mode })
}

function RewindOptions(props: {
  messageId: string
  available: RewindMode[]
  onPick: (mode: RewindMode) => void
}) {
  const { preview, codeError } = useCodePreview(props.messageId, false)
  const cwd = useStore((state) =>
    state.selection === null
      ? ''
      : (projectOf(state, state.selection.machine, state.selection.projectId)
          ?.path ?? '')
  )

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
          onSelect={() => props.onPick(option)}
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
  checked: boolean
  onBusy: (busy: boolean) => void
}) {
  const { preview, codeError } = useCodePreview(
    props.target.messageId,
    props.checked
  )
  const messageId = props.target.messageId
  const selection = useStore((state) => state.selection)
  const machine = selection?.machine ?? null
  const sessionId = selection?.sessionId ?? null
  const projectId = selection?.projectId ?? ''

  async function apply() {
    if (machine === null || sessionId === null) {
      return
    }
    props.onBusy(true)
    try {
      await call(machine, 'sessions.rewind', {
        sessionId,
        projectId,
        messageId,
        settings: getState().settings,
        code: true,
        conversation: false,
        dryRun: false,
      })
      updatePrefs({ ...getState().prefs, rewind: 'code' })
    } catch (caught) {
      toast(errorMessage(caught))
      showError(caught)
    } finally {
      props.onBusy(false)
    }
  }

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>{modes.code.label}?</AlertDialogTitle>
        <AlertDialogDescription>
          {modes.code.description} Do you really want to continue?
          {codeError !== null && (
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
          icon={modes.code.icon}
          disabled={!props.checked && (preview === null || codeError !== null)}
          onClick={() => void apply()}
        >
          {modes.code.label}
        </AlertDialogAction>
      </AlertDialogFooter>
    </>
  )
}

function useCodePreview(messageId: string, skip: boolean) {
  const [preview, setPreview] = useState<RewindResult>(null)
  const [codeError, setCodeError] = useState<string | null>(null)
  const selection = useStore((state) => state.selection)
  const machine = selection?.machine ?? null
  const sessionId = selection?.sessionId ?? null
  const projectId = selection?.projectId ?? ''

  useEffect(() => {
    setPreview(null)
    setCodeError(null)
    if (skip || machine === null || sessionId === null) {
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
  }, [skip, messageId, machine, sessionId, projectId])

  return { preview, codeError }
}
