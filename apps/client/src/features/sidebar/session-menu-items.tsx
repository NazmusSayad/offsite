import {
  AiContentGenerator02Icon,
  BookmarkAdd02Icon,
  BookmarkRemove02Icon,
  ArrowExpandDiagonal01Icon,
  SunriseIcon,
  Delete02Icon,
  FileExportIcon,
  FolderAddIcon,
  MinimizeIcon,
  PencilEdit02Icon,
  PinIcon,
  PinOffIcon,
  PlayIcon,
  TickDouble01Icon,
  ZzzIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'
import { machineKey } from '@/api/machines'
import { updateProject } from '@/api/projects'
import {
  ContextMenuItem,
  ContextMenuSeparator,
} from '@/components/ui/context-menu'
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { toggleBookmark, useBookmarked } from '@/lib/bookmarks'
import { providerNames } from '@/lib/format'
import { chatSessionId } from '@/lib/outbox'
import { editSession, regenerateTitle, removeSession } from '@/lib/sessions'
import {
  type MachineSession,
  projectOf,
  showError,
  showExport,
  useStore,
} from '@/lib/store'
import type { DebugAction } from './debug-dialogs'
import { DebugMenu } from './debug-menu'

export function SessionMenuItems(props: {
  session: MachineSession
  context: boolean
  mobile: boolean
  onDeactivate: () => void
  onDebug: ((action: DebugAction) => void) | null
  onRename: () => void
}) {
  const session = props.session
  const [confirming, setConfirming] = useState(false)
  const generatingTitle = useStore((state) =>
    state.generatingTitles.includes(machineKey(session.machine, session.id))
  )
  const scratch = useStore(
    (state) =>
      projectOf(state, session.machine, session.projectId)?.scratch === true
  )
  const target = {
    sessionId: session.id,
    itemId: null,
    start: null,
    end: null,
  }
  const bookmarked = useBookmarked(session.machine, target)
  const pending = chatSessionId(session.id) === null
  const Item = props.context ? ContextMenuItem : DropdownMenuItem
  const Separator = props.context ? ContextMenuSeparator : DropdownMenuSeparator

  return (
    <>
      <div className="grid grid-cols-3 gap-1">
        <Item
          title={session.status === 'inactive' ? 'Resume' : 'Done'}
          className="justify-center bg-green-500/10 py-2 **:text-green-600! focus:bg-green-500/20 dark:**:text-green-400!"
          onSelect={() => {
            if (session.status === 'inactive') {
              void editSession(session.machine, session.id, {
                status: 'active',
              })
              return
            }
            props.onDeactivate()
          }}
        >
          <HugeiconsIcon
            className="size-5"
            icon={session.status === 'inactive' ? PlayIcon : TickDouble01Icon}
          />
        </Item>
        <Item
          title={session.status === 'snoozed' ? 'Unsnooze' : 'Snooze'}
          className="justify-center bg-amber-500/10 py-2 **:text-amber-600! focus:bg-amber-500/20 dark:**:text-amber-400!"
          onSelect={() =>
            void editSession(session.machine, session.id, {
              status: session.status === 'snoozed' ? 'active' : 'snoozed',
            })
          }
        >
          <HugeiconsIcon
            className="size-5"
            icon={session.status === 'snoozed' ? SunriseIcon : ZzzIcon}
          />
        </Item>
        <Item
          title={session.status === 'minimized' ? 'Restore' : 'Minimize'}
          className="justify-center bg-sky-500/10 py-2 **:text-sky-600! focus:bg-sky-500/20 dark:**:text-sky-400!"
          onSelect={() =>
            void editSession(session.machine, session.id, {
              status: session.status === 'minimized' ? 'active' : 'minimized',
            })
          }
        >
          <HugeiconsIcon
            className="size-5"
            icon={
              session.status === 'minimized'
                ? ArrowExpandDiagonal01Icon
                : MinimizeIcon
            }
          />
        </Item>
      </div>
      <Item
        onSelect={() =>
          void editSession(session.machine, session.id, {
            status: session.status === 'pinned' ? 'active' : 'pinned',
          })
        }
      >
        <HugeiconsIcon
          icon={session.status === 'pinned' ? PinOffIcon : PinIcon}
        />
        {session.status === 'pinned' ? 'Unpin' : 'Pin'}
      </Item>
      <Item
        disabled={pending}
        onSelect={(event) => {
          event.preventDefault()
          toggleBookmark(session.machine, target)
        }}
      >
        <HugeiconsIcon
          icon={bookmarked ? BookmarkRemove02Icon : BookmarkAdd02Icon}
        />
        {bookmarked ? 'Remove bookmark' : 'Bookmark'}
      </Item>
      <Separator />
      {props.onDebug !== null && (
        <DebugMenu
          session={session}
          context={props.context}
          onDebug={props.onDebug}
        />
      )}
      <Item
        disabled={pending || generatingTitle}
        onSelect={() => void regenerateTitle(session)}
      >
        <HugeiconsIcon icon={AiContentGenerator02Icon} />
        Refresh title
      </Item>
      <Item disabled={pending} onSelect={props.onRename}>
        <HugeiconsIcon icon={PencilEdit02Icon} />
        Rename
      </Item>
      <Item disabled={pending} onSelect={() => showExport(session)}>
        <HugeiconsIcon icon={FileExportIcon} />
        Export
      </Item>
      {scratch && (
        <Item
          disabled={pending}
          onSelect={() =>
            updateProject(session.machine, session.projectId, {
              scratch: false,
              name: session.title,
            }).catch(showError)
          }
        >
          <HugeiconsIcon icon={FolderAddIcon} />
          Turn into project
        </Item>
      )}
      <Item
        disabled={pending}
        variant="destructive"
        title={`Also removes it from ${providerNames[session.provider]}`}
        onSelect={(event) => {
          if (confirming) {
            void removeSession(session.machine, session.id, session)
            return
          }
          event.preventDefault()
          setConfirming(true)
        }}
      >
        <HugeiconsIcon icon={Delete02Icon} />
        {confirming
          ? props.mobile
            ? 'Tap again to delete'
            : 'Click again to delete'
          : 'Delete'}
      </Item>
    </>
  )
}
