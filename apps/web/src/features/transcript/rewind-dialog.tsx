import type { RewindResult } from '@offsite/core/protocol'
import { useEffect, useState } from 'react'
import { call } from '@/api/connection'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { openSession } from '@/lib/sessions'
import { getState, projectOf, setDraft, useStore } from '@/lib/store'
import { errorMessage } from '@/lib/utils'
import { relative } from './tool-details'

export type RewindTarget = { messageId: string; text: string; first: boolean }

export function RewindDialog(props: {
  target: RewindTarget | null
  onClose: () => void
}) {
  const [preview, setPreview] = useState<RewindResult>(null)
  const [codeError, setCodeError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const target = props.target
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
    if (
      target === null ||
      machine === null ||
      sessionId === null ||
      !restoresCode
    )
      return
    let current = true
    call(machine, 'sessions.rewind', {
      sessionId,
      projectId,
      messageId: target.messageId,
      settings: getState().settings,
      code: true,
      conversation: false,
      dryRun: true,
    }).then(
      (result) => {
        if (current) setPreview(result)
      },
      (caught: unknown) => {
        if (current) setCodeError(errorMessage(caught))
      }
    )
    return () => {
      current = false
    }
  }, [target, machine, sessionId, projectId, restoresCode])

  async function apply(code: boolean, conversation: boolean) {
    if (target === null || machine === null || sessionId === null) return
    setBusy(true)
    setError(null)
    try {
      const truncate =
        conversation && (!target.first || provider === 'opencode')
      if (code || truncate)
        await call(machine, 'sessions.rewind', {
          sessionId,
          projectId,
          messageId: target.messageId,
          settings: getState().settings,
          code,
          conversation: truncate,
          dryRun: false,
        })
      if (conversation && target.first && provider !== 'opencode')
        openSession({ machine, projectId, sessionId: null })
      if (conversation) setDraft(target.text)
      props.onClose()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  const codeReady = preview !== null && codeError === null
  return (
    <Dialog open={target !== null} onOpenChange={() => props.onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rewind to this message</DialogTitle>
          <DialogDescription>
            The conversation restarts from just before this message, which goes
            back into the composer so you can edit and resend it.
          </DialogDescription>
        </DialogHeader>
        {restoresCode && (
          <div className="bg-secondary dark:bg-input/20 text-muted-foreground rounded-lg px-3 py-2 text-xs">
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
                <ul className="mt-1 max-h-32 overflow-y-auto font-mono">
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
        {error !== null && <p className="text-destructive text-xs">{error}</p>}
        <div className="flex flex-col gap-2">
          {restoresCode && (
            <Button
              disabled={busy || !codeReady}
              onClick={() => void apply(true, true)}
            >
              Restore code and conversation
            </Button>
          )}
          <Button
            variant={restoresCode ? 'secondary' : 'default'}
            disabled={busy}
            onClick={() => void apply(false, true)}
          >
            {restoresCode
              ? 'Restore conversation only'
              : 'Restore conversation'}
          </Button>
          {provider === 'claude' && (
            <Button
              variant="secondary"
              disabled={busy || !codeReady}
              onClick={() => void apply(true, false)}
            >
              Restore code only
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
