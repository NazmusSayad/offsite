import {
  AiContentGenerator02Icon,
  Delete02Icon,
  MinimizeIcon,
  PencilEdit02Icon,
  PinIcon,
  PinOffIcon,
  PowerIcon,
  TickDouble01Icon,
  ZzzIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'
import { machineKey } from '@/api/machines'
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
import { type MachineSession, useStore } from '@/lib/store'

export function SessionMenuItems(props: {
  session: MachineSession
  context: boolean
  mobile: boolean
  onDeactivate: () => void
  onRename: () => void
}) {
  const session = props.session
  const [confirming, setConfirming] = useState(false)
  const generatingTitle = useStore((state) =>
    state.generatingTitles.includes(machineKey(session.machine, session.id))
  )
  const Item = props.context ? ContextMenuItem : DropdownMenuItem
  const Separator = props.context ? ContextMenuSeparator : DropdownMenuSeparator

  return (
    <>
      {session.status !== 'inactive' && (
        <Item onSelect={props.onDeactivate}>
          <HugeiconsIcon icon={TickDouble01Icon} />
          Done
        </Item>
      )}
      {session.status !== 'active' && (
        <Item
          onSelect={() =>
            void editSession(session.machine, session.id, {
              status: 'active',
            })
          }
        >
          <HugeiconsIcon
            icon={session.status === 'pinned' ? PinOffIcon : PowerIcon}
          />
          {session.status === 'pinned' ? 'Unpin' : 'Activate'}
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
      <Item
        variant="destructive"
        title={`Also removes it from ${providerNames[session.provider]}`}
        onSelect={(event) => {
          if (confirming) {
            void removeSession(session.machine, session.id)
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
