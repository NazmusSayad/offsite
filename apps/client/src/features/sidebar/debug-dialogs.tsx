import {
  Copy01Icon,
  Tick02Icon,
  RefreshIcon,
  StopCircleIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { SessionContext, SessionRuntime } from '@offsite/core/sessions'
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useCopy } from '@/lib/clipboard'
import { compact, providerNames } from '@/lib/format'
import { restartSession, stopClaude } from '@/lib/sessions'
import {
  type MachineSession,
  machineOf,
  showError,
  useStore,
} from '@/lib/store'

export type DebugAction = 'restart' | 'stop' | 'context' | 'runtime'

export function DebugDialogs(props: {
  session: MachineSession
  action: DebugAction | null
  onActionChange: (action: DebugAction | null) => void
}) {
  return (
    <>
      <AlertDialog
        open={props.action === 'restart'}
        onOpenChange={(open) => {
          if (!open) {
            props.onActionChange(null)
          }
        }}
      >
        <AlertDialogContent>
          <RestartDialog session={props.session} />
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={props.action === 'stop'}
        onOpenChange={(open) => {
          if (!open) {
            props.onActionChange(null)
          }
        }}
      >
        <AlertDialogContent>
          <StopDialog session={props.session} />
        </AlertDialogContent>
      </AlertDialog>
      <Dialog
        open={props.action === 'context'}
        onOpenChange={(open) => {
          if (!open) {
            props.onActionChange(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
          <ContextDialog
            session={props.session}
            onActionChange={props.onActionChange}
          />
        </DialogContent>
      </Dialog>
      <Dialog
        open={props.action === 'runtime'}
        onOpenChange={(open) => {
          if (!open) {
            props.onActionChange(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
          <RuntimeDialog
            session={props.session}
            onActionChange={props.onActionChange}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}

function RestartDialog(props: { session: MachineSession }) {
  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>Restart Claude?</AlertDialogTitle>
        <AlertDialogDescription>
          Claude Code stops for this thread, with all background tasks. Then it
          starts again.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction
          variant="destructive"
          icon={RefreshIcon}
          onClick={() =>
            restartSession(props.session.machine, props.session.id)
          }
        >
          Restart
        </AlertDialogAction>
      </AlertDialogFooter>
    </>
  )
}

function StopDialog(props: { session: MachineSession }) {
  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>Stop Claude?</AlertDialogTitle>
        <AlertDialogDescription>
          Claude Code stops for this thread, with all background tasks. Your
          next message starts it again.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction
          variant="destructive"
          icon={StopCircleIcon}
          onClick={() => stopClaude(props.session.machine, props.session.id)}
        >
          Stop
        </AlertDialogAction>
      </AlertDialogFooter>
    </>
  )
}

function ContextDialog(props: {
  session: MachineSession
  onActionChange: (action: DebugAction | null) => void
}) {
  const session = props.session
  const onActionChange = props.onActionChange
  const [context, setContext] = useState<SessionContext | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        setContext(
          await call(session.machine, 'sessions.context', {
            sessionId: session.id,
            projectId: session.projectId,
          })
        )
      } catch (error) {
        showError(error)
        onActionChange(null)
      }
    })()
  }, [session.machine, session.id, session.projectId, onActionChange])

  return (
    <>
      <DialogHeader>
        <DialogTitle>Context</DialogTitle>
      </DialogHeader>
      {context === null && (
        <p className="text-muted-foreground text-sm">Loading…</p>
      )}
      {context !== null && (
        <div className="grid gap-4 text-sm">
          <p className="tabular-nums">
            {context.usage === null && 'No context used yet'}
            {context.usage !== null &&
              context.usage.window === null &&
              `${compact(context.usage.tokens)} tokens`}
            {context.usage !== null &&
              context.usage.window !== null &&
              `${compact(context.usage.tokens)} of ${compact(context.usage.window)} tokens (${Math.round((context.usage.tokens / context.usage.window) * 100)}%)`}
          </p>
          <div className="grid gap-1.5">
            <h3 className="font-medium">Loaded skills</h3>
            {context.skills === null && (
              <p className="text-muted-foreground">
                {providerNames[session.provider]} is not running for this
                thread. Loaded skills show while it runs.
              </p>
            )}
            {context.skills !== null && context.skills.length === 0 && (
              <p className="text-muted-foreground">No skills loaded</p>
            )}
            {context.skills !== null && context.skills.length > 0 && (
              <ul className="max-h-72 overflow-y-auto">
                {context.skills.map((skill) => (
                  <li
                    key={skill.name}
                    className="flex justify-between gap-4 py-0.5"
                  >
                    <span className="truncate">{skill.name}</span>
                    {skill.tokens !== null && (
                      <span className="text-muted-foreground tabular-nums">
                        {compact(skill.tokens)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  )
}

function RuntimeDialog(props: {
  session: MachineSession
  onActionChange: (action: DebugAction | null) => void
}) {
  const session = props.session
  const onActionChange = props.onActionChange
  const clipboard = useCopy()
  const machine = useStore((state) => machineOf(state, session.machine))
  const [runtime, setRuntime] = useState<SessionRuntime | null | undefined>()

  useEffect(() => {
    void (async () => {
      try {
        setRuntime(
          await call(session.machine, 'sessions.runtime', {
            sessionId: session.id,
          })
        )
      } catch (error) {
        showError(error)
        onActionChange(null)
      }
    })()
  }, [session.machine, session.id, onActionChange])

  const account =
    runtime === undefined || runtime === null
      ? undefined
      : [...machine.claudeAccounts, ...machine.codexAccounts].find(
          (item) => item.id === runtime.settings.accountId
        )

  return (
    <>
      <DialogHeader>
        <DialogTitle>Runtime</DialogTitle>
      </DialogHeader>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-muted-foreground">Session ID</dt>
        <dd className="flex items-center gap-1.5">
          <span className="truncate font-mono text-xs">{session.id}</span>
          <button
            className="text-muted-foreground hover:text-foreground"
            aria-label="Copy session ID"
            title="Copy session ID"
            onClick={() => void clipboard.copy(session.id)}
          >
            <HugeiconsIcon
              icon={clipboard.copied ? Tick02Icon : Copy01Icon}
              className="size-3.5"
            />
          </button>
        </dd>
        <dt className="text-muted-foreground">Process</dt>
        <dd>
          {runtime === undefined && 'Loading…'}
          {runtime === null &&
            `${providerNames[session.provider]} is not running`}
          {runtime !== undefined &&
            runtime !== null &&
            [
              runtime.running ? 'Working' : 'Idle',
              ...(runtime.compacting ? ['compacting'] : []),
            ].join(', ')}
        </dd>
        {runtime !== undefined && runtime !== null && (
          <>
            <dt className="text-muted-foreground">Model</dt>
            <dd className="truncate">{runtime.settings.model ?? 'Default'}</dd>
            <dt className="text-muted-foreground">Effort</dt>
            <dd>{runtime.settings.effort ?? 'Default'}</dd>
            <dt className="text-muted-foreground">Mode</dt>
            <dd>
              {runtime.settings.mode ?? 'Default'}
              {runtime.settings.plan && ', plan'}
            </dd>
            {runtime.settings.accountId !== null && (
              <>
                <dt className="text-muted-foreground">Account</dt>
                <dd className="truncate">
                  {account?.name ?? runtime.settings.accountId}
                </dd>
              </>
            )}
            <dt className="text-muted-foreground">Folder</dt>
            <dd className="font-mono text-xs break-all">{runtime.cwd}</dd>
            <dt className="text-muted-foreground">Waiting for answers</dt>
            <dd className="tabular-nums">{runtime.waiting}</dd>
            <dt className="text-muted-foreground">Queued messages</dt>
            <dd className="tabular-nums">{runtime.queued}</dd>
            <dt className="text-muted-foreground">Background tasks</dt>
            <dd className="tabular-nums">{runtime.backgroundTasks}</dd>
            <dt className="text-muted-foreground">Background agents</dt>
            <dd className="tabular-nums">{runtime.backgroundAgents}</dd>
          </>
        )}
      </dl>
    </>
  )
}
