import {
  AiContentGenerator02Icon,
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
  RefreshIcon,
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
import { providerNames } from '@/lib/format'
import { editSession, regenerateTitle, removeSession } from '@/lib/sessions'
import {
  type MachineSession,
  projectOf,
  showError,
  showExport,
  useStore,
} from '@/lib/store'

const restore = {
  snoozed: { icon: SunriseIcon, label: 'Unsnooze' },
  minimized: { icon: ArrowExpandDiagonal01Icon, label: 'Restore' },
  inactive: { icon: PlayIcon, label: 'Resume' },
  pinned: { icon: PinOffIcon, label: 'Unpin' },
} as const

export function SessionMenuItems(props: {
  session: MachineSession
  context: boolean
  mobile: boolean
  onDeactivate: () => void
  onRestart: (() => void) | null
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
  const Item = props.context ? ContextMenuItem : DropdownMenuItem
  const Separator = props.context ? ContextMenuSeparator : DropdownMenuSeparator

  return (
    <>
      {session.status !== 'active' && (
        <Item
          onSelect={() =>
            void editSession(session.machine, session.id, {
              status: 'active',
            })
          }
        >
          <HugeiconsIcon icon={restore[session.status].icon} />
          {restore[session.status].label}
        </Item>
      )}
      {session.status !== 'inactive' && (
        <Item onSelect={props.onDeactivate}>
          <HugeiconsIcon icon={TickDouble01Icon} />
          Done
        </Item>
      )}
      {session.status !== 'snoozed' && (
        <Item
          onSelect={() =>
            void editSession(session.machine, session.id, {
              status: 'snoozed',
            })
          }
        >
          <HugeiconsIcon icon={ZzzIcon} />
          Snooze
        </Item>
      )}
      {session.status !== 'minimized' && (
        <Item
          onSelect={() =>
            void editSession(session.machine, session.id, {
              status: 'minimized',
            })
          }
        >
          <HugeiconsIcon icon={MinimizeIcon} />
          Minimize
        </Item>
      )}
      {session.status !== 'pinned' && (
        <Item
          onSelect={() =>
            void editSession(session.machine, session.id, {
              status: 'pinned',
            })
          }
        >
          <HugeiconsIcon icon={PinIcon} />
          Pin
        </Item>
      )}
      <Separator />
      {session.provider === 'claude' && props.onRestart !== null && (
        <Item onSelect={props.onRestart}>
          <HugeiconsIcon icon={RefreshIcon} />
          Restart Claude
        </Item>
      )}
      <Item
        disabled={generatingTitle}
        onSelect={() => void regenerateTitle(session)}
      >
        <HugeiconsIcon icon={AiContentGenerator02Icon} />
        Refresh title
      </Item>
      <Item onSelect={props.onRename}>
        <HugeiconsIcon icon={PencilEdit02Icon} />
        Rename
      </Item>
      <Item onSelect={() => showExport(session)}>
        <HugeiconsIcon icon={FileExportIcon} />
        Export
      </Item>
      {scratch && (
        <Item
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
        variant="destructive"
        title={`Also removes it from ${providerNames[session.provider]}`}
        onSelect={(event) => {
          if (confirming) {
            void removeSession(session.machine, session.id, session.projectId)
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
