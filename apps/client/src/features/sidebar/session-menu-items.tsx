import {
  AiContentGenerator02Icon,
  AlarmClockIcon,
  AlarmClockOffIcon,
  Delete02Icon,
  MaximizeIcon,
  MinimizeIcon,
  PencilEdit02Icon,
  PinIcon,
  PinOffIcon,
  Plug01Icon,
  PlugZapIcon,
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
  mobile: boolean
  onDeactivate: () => void
  onRename: () => void
}) {
  const session = props.session
  const [confirming, setConfirming] = useState(false)
  const generatingTitle = useStore((state) =>
    state.generatingTitles.includes(machineKey(session.machine, session.id))
  )
  const Item = props.mobile ? ContextMenuItem : DropdownMenuItem
  const Separator = props.mobile ? ContextMenuSeparator : DropdownMenuSeparator

  return (
    <>
      {session.status === 'inactive' ? (
        <Item
          onSelect={() =>
            void editSession(session.machine, session.id, {
              status: 'active',
            })
          }
        >
          <HugeiconsIcon icon={PlugZapIcon} />
          Make active
        </Item>
      ) : (
        <Item onSelect={props.onDeactivate}>
          <HugeiconsIcon icon={Plug01Icon} />
          Inactive
        </Item>
      )}
      <Item
        onSelect={() =>
          void editSession(session.machine, session.id, {
            status: session.status === 'snoozed' ? 'active' : 'snoozed',
          })
        }
      >
        <HugeiconsIcon
          icon={
            session.status === 'snoozed' ? AlarmClockOffIcon : AlarmClockIcon
          }
        />
        {session.status === 'snoozed' ? 'Unsnooze' : 'Snooze'}
      </Item>
      <Item
        onSelect={() =>
          void editSession(session.machine, session.id, {
            status: session.status === 'minimized' ? 'active' : 'minimized',
          })
        }
      >
        <HugeiconsIcon
          icon={session.status === 'minimized' ? MaximizeIcon : MinimizeIcon}
        />
        {session.status === 'minimized' ? 'Restore' : 'Minimize'}
      </Item>
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
      <Separator />
      <Item
        disabled={generatingTitle}
        onSelect={() => void regenerateTitle(session)}
      >
        <HugeiconsIcon icon={AiContentGenerator02Icon} />
        Regenerate title
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
