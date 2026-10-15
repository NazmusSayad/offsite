import {
  Delete02Icon,
  Folder01Icon,
  ImageAdd01Icon,
  ImageRemove01Icon,
  MinusSignIcon,
  Notification01Icon,
  PencilEdit02Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { ReactNode } from 'react'
import { toggleQuiet } from '@/attention'
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { getState } from '@/session'

export function ItemMenu(props: {
  closeLabel: string
  onRename: () => void
  onClose: () => void
  onMinimize?: () => void
  onSetFolder?: () => void
  onChangeLogo?: () => void
  onRemoveLogo?: () => void
  tabId?: number
  children: ReactNode
}) {
  const tabId = props.tabId

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{props.children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={props.onRename}>
          <HugeiconsIcon icon={PencilEdit02Icon} />
          Rename
        </ContextMenuItem>
        {props.onMinimize && (
          <ContextMenuItem onSelect={props.onMinimize}>
            <HugeiconsIcon icon={MinusSignIcon} />
            Minimize
          </ContextMenuItem>
        )}
        {props.onSetFolder && (
          <ContextMenuItem onSelect={props.onSetFolder}>
            <HugeiconsIcon icon={Folder01Icon} />
            Set folder…
          </ContextMenuItem>
        )}
        {props.onChangeLogo && (
          <ContextMenuItem onSelect={props.onChangeLogo}>
            <HugeiconsIcon icon={ImageAdd01Icon} />
            Change logo
          </ContextMenuItem>
        )}
        {props.onRemoveLogo && (
          <ContextMenuItem onSelect={props.onRemoveLogo}>
            <HugeiconsIcon icon={ImageRemove01Icon} />
            Remove logo
          </ContextMenuItem>
        )}
        {tabId !== undefined && (
          <ContextMenuCheckboxItem
            checked={getState().quiet.includes(tabId)}
            onCheckedChange={() => toggleQuiet(tabId)}
          >
            <HugeiconsIcon icon={Notification01Icon} />
            Notify when quiet for 10s
          </ContextMenuCheckboxItem>
        )}
        <ContextMenuItem variant="destructive" onSelect={props.onClose}>
          <HugeiconsIcon icon={Delete02Icon} />
          {props.closeLabel}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
