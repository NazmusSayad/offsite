import {
  Delete02Icon,
  Folder01Icon,
  ImageAdd01Icon,
  ImageRemove01Icon,
  ImageRemove02Icon,
  MinusSignIcon,
  Notification01Icon,
  PencilEdit02Icon,
  WallpaperIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { type ReactNode, useRef } from 'react'
import { toggleQuiet } from '@/attention'
import { removeGroupBackground, uploadGroupBackground } from '@/backgrounds'
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
  backgroundGroup?: { id: number; background: string | null }
  tabId?: number
  children: ReactNode
}) {
  const backgroundGroup = props.backgroundGroup
  const tabId = props.tabId
  const backgroundInput = useRef<HTMLInputElement>(null)

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
        {backgroundGroup && (
          <ContextMenuItem onSelect={() => backgroundInput.current?.click()}>
            <HugeiconsIcon icon={WallpaperIcon} />
            Change background
          </ContextMenuItem>
        )}
        {backgroundGroup && backgroundGroup.background !== null && (
          <ContextMenuItem
            onSelect={() => removeGroupBackground(backgroundGroup.id)}
          >
            <HugeiconsIcon icon={ImageRemove02Icon} />
            Remove background
          </ContextMenuItem>
        )}
        {tabId !== undefined && getState().config.behavior.activityMarks && (
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
      {backgroundGroup && (
        <input
          ref={backgroundInput}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml,image/x-icon,image/vnd.microsoft.icon"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file !== undefined)
              uploadGroupBackground(backgroundGroup.id, file)
          }}
        />
      )}
    </ContextMenu>
  )
}
