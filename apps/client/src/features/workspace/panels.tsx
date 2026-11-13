import { Asterisk02Icon, MoreVerticalIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { GitRepo } from '@offsite/core/git'
import { type ReactNode, useState } from 'react'
import { FaAngleRight } from 'react-icons/fa6'
import { useReadLocalStorage } from 'usehooks-ts'
import { HotkeyHint } from '@/components/hotkey-hint'
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
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { useEditorShortcut } from '@/features/files/use-editor-shortcut'
import {
  type DebugAction,
  DebugDialogs,
} from '@/features/sidebar/debug-dialogs'
import { SessionMenuItems } from '@/features/sidebar/session-menu-items'
import { deactivateSession, editSession } from '@/lib/sessions'
import {
  activityOf,
  type MachineSession,
  type Selection,
  showEditor,
  updatePrefs,
  threadState,
  useStore,
} from '@/lib/store'
import { cn } from '@/lib/utils'
import { usePanelOptions } from './panel-options'

export type Panel = 'diff' | 'pulls' | 'tasks' | 'browser'

const toggle =
  'text-foreground hover:bg-accent data-[pressed=true]:bg-accent relative grid h-7 min-w-7 cursor-pointer place-items-center rounded-lg border border-transparent [&_svg]:size-4 [&_svg]:opacity-80'

export type ToggleProps = {
  selection: Selection
  panel: Panel | null
  terminal: boolean
  repos: GitRepo[]
  onPanel: (panel: Panel | null) => void
  onTerminal: (open: boolean) => void
}

export function PanelToggles(props: ToggleProps & { children: ReactNode }) {
  const options = usePanelOptions(props)
  const prefs = useStore((state) => state.prefs)
  const editorClosed = useStore((state) => state.editor === null)
  useEditorShortcut(
    () =>
      showEditor({
        machine: props.selection.machine,
        projectId: props.selection.projectId,
      }),
    editorClosed
  )

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="flex items-center gap-1">
          {options
            .filter((option) => prefs.toolbar.includes(option.id))
            .map((option) => (
              <button
                key={option.id}
                className={toggle}
                data-pressed={option.pressed}
                aria-label={option.label}
                title={option.title}
                onClick={option.onSelect}
              >
                <HugeiconsIcon icon={option.icon} />
                {option.hotkey !== null && (
                  <HotkeyHint
                    keyName={option.hotkey.keyName}
                    placement={option.hotkey.placement}
                  />
                )}
                {option.dot !== null && option.dot.color !== null && (
                  <span
                    className={cn(
                      'ring-background absolute top-0.5 right-0.5 size-1.5 rounded-full bg-current ring-2',
                      option.dot.color
                    )}
                  />
                )}
              </button>
            ))}
          {props.children}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-44">
        {options.map((option) => (
          <ContextMenuCheckboxItem
            key={option.id}
            checked={prefs.toolbar.includes(option.id)}
            onCheckedChange={(checked) =>
              updatePrefs({
                ...prefs,
                toolbar: checked
                  ? [...prefs.toolbar, option.id]
                  : prefs.toolbar.filter((id) => id !== option.id),
              })
            }
          >
            <HugeiconsIcon icon={option.icon} />
            {option.label}
          </ContextMenuCheckboxItem>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  )
}

export function PanelMenu(
  props: ToggleProps & {
    mobile: boolean
    session: MachineSession | undefined
    open: boolean
    onOpenChange: (open: boolean) => void
    children: ReactNode
  }
) {
  const session = props.session
  const toolbar = useStore((state) => state.prefs.toolbar)
  const options = usePanelOptions(props).filter(
    (option) => props.mobile || !toolbar.includes(option.id)
  )
  const [title, setTitle] = useState<string | null>(null)
  const [warning, setWarning] = useState(false)
  const [debug, setDebug] = useState<DebugAction | null>(null)

  return (
    <div className="flex shrink-0 items-center gap-1">
      <DropdownMenu open={props.open} onOpenChange={props.onOpenChange}>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(toggle, 'data-[state=open]:bg-accent')}
            aria-label="More"
            title="More"
          >
            <HugeiconsIcon icon={MoreVerticalIcon} />
            {options.map(
              (option) =>
                option.attention !== null && (
                  <span
                    key={option.id}
                    className={cn('contents', option.attention)}
                  >
                    {option.id === 'terminal' && (
                      <FaAngleRight
                        strokeWidth={20}
                        className="absolute top-[5px] left-[5px] size-[9px]! -translate-1/2 opacity-100!"
                      />
                    )}
                    {option.id === 'tasks' && (
                      <span className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-current" />
                    )}
                    {option.id === 'diff' && (
                      <HugeiconsIcon
                        icon={Asterisk02Icon}
                        strokeWidth={4.25}
                        className="absolute right-px bottom-0.5 size-2! scale-[1.0625] opacity-100!"
                      />
                    )}
                  </span>
                )
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-56 [&>[data-slot=dropdown-menu-separator]:first-child]:hidden"
          align="end"
        >
          {options.map((option) => (
            <DropdownMenuItem key={option.id} onSelect={option.onSelect}>
              <HugeiconsIcon icon={option.icon} />
              <span className="flex-1">{option.label}</span>
              {option.dot !== null && (
                <span className="text-muted-foreground flex items-center gap-1.5 text-xs tabular-nums">
                  {option.dot.status}
                  {option.id !== 'diff' && option.dot.color !== null && (
                    <span
                      className={cn(
                        'size-1.5 rounded-full bg-current',
                        option.dot.color
                      )}
                    />
                  )}
                </span>
              )}
            </DropdownMenuItem>
          ))}
          {props.children}
          {session !== undefined && (
            <ThreadMenuItems
              session={session}
              mobile={props.mobile}
              onWarn={() => setWarning(true)}
              onDebug={setDebug}
              onRename={() => setTitle(session.title)}
            />
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {session !== undefined && title !== null && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setTitle(null)
            }
          }}
        >
          <DialogContent>
            <form
              className="grid gap-4"
              onSubmit={(event) => {
                event.preventDefault()
                const value = title.trim()
                setTitle(null)
                if (value !== '' && value !== session.title) {
                  void editSession(session.machine, session.id, {
                    title: value,
                  })
                }
              }}
            >
              <DialogHeader>
                <DialogTitle>Rename thread</DialogTitle>
              </DialogHeader>
              <Input
                aria-label="Title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setTitle(null)}
                >
                  Cancel
                </Button>
                <Button type="submit">Rename</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
      <AlertDialog open={warning} onOpenChange={setWarning}>
        <AlertDialogContent>
          <StopWorkDialog session={session} />
        </AlertDialogContent>
      </AlertDialog>
      {session !== undefined && (
        <DebugDialogs
          session={session}
          action={debug}
          onActionChange={setDebug}
        />
      )}
    </div>
  )
}

function ThreadMenuItems(props: {
  session: MachineSession
  mobile: boolean
  onWarn: () => void
  onDebug: (action: DebugAction) => void
  onRename: () => void
}) {
  const session = props.session
  const scope = useReadLocalStorage<{
    machine: string
    projectId: string
  } | null>('sidebarScope')
  const busy = useStore(
    (state) =>
      threadState(
        activityOf(state.machines, session.machine, session.id),
        false
      ).busy
  )

  return (
    <>
      <DropdownMenuSeparator />
      <SessionMenuItems
        session={session}
        context={false}
        mobile={props.mobile}
        onDeactivate={() => {
          if (busy) {
            props.onWarn()
            return
          }
          void deactivateSession(session.machine, session.id, scope)
        }}
        onDebug={props.onDebug}
        onRename={props.onRename}
      />
    </>
  )
}

function StopWorkDialog(props: { session: MachineSession | undefined }) {
  const scope = useReadLocalStorage<{
    machine: string
    projectId: string
  } | null>('sidebarScope')

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>Stop running work?</AlertDialogTitle>
        <AlertDialogDescription>
          The agent or background tasks are running. Do you really want to stop
          them?
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction
          variant="destructive"
          onClick={() => {
            if (props.session === undefined) {
              throw new Error('session is missing')
            }
            void deactivateSession(
              props.session.machine,
              props.session.id,
              scope
            )
          }}
        >
          Stop and Mark Done
        </AlertDialogAction>
      </AlertDialogFooter>
    </>
  )
}
