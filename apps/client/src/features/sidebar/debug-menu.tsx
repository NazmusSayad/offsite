import {
  Bug01Icon,
  CpuIcon,
  DashboardSpeed01Icon,
  RefreshIcon,
  StopCircleIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuPortal,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@/components/ui/context-menu'
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu'
import type { MachineSession } from '@/lib/store'
import type { DebugAction } from './debug-dialogs'

export function DebugMenu(props: {
  session: MachineSession
  context: boolean
  onDebug: (action: DebugAction) => void
}) {
  const Sub = props.context ? ContextMenuSub : DropdownMenuSub
  const SubTrigger = props.context
    ? ContextMenuSubTrigger
    : DropdownMenuSubTrigger
  const SubContent = props.context
    ? ContextMenuSubContent
    : DropdownMenuSubContent
  const Portal = props.context ? ContextMenuPortal : DropdownMenuPortal
  const Item = props.context ? ContextMenuItem : DropdownMenuItem
  const Label = props.context ? ContextMenuLabel : DropdownMenuLabel
  const Separator = props.context ? ContextMenuSeparator : DropdownMenuSeparator

  return (
    <Sub>
      <SubTrigger>
        <HugeiconsIcon icon={Bug01Icon} />
        Debug
      </SubTrigger>
      <Portal>
        <SubContent className="w-44">
          <Label>General</Label>
          <Item onSelect={() => props.onDebug('context')}>
            <HugeiconsIcon icon={DashboardSpeed01Icon} />
            Context
          </Item>
          <Item onSelect={() => props.onDebug('runtime')}>
            <HugeiconsIcon icon={CpuIcon} />
            Runtime
          </Item>
          {props.session.provider === 'claude' && (
            <>
              <Separator />
              <Label>Claude</Label>
              <Item onSelect={() => props.onDebug('restart')}>
                <HugeiconsIcon icon={RefreshIcon} />
                Restart Claude
              </Item>
              <Item onSelect={() => props.onDebug('stop')}>
                <HugeiconsIcon icon={StopCircleIcon} />
                Stop Claude
              </Item>
            </>
          )}
        </SubContent>
      </Portal>
    </Sub>
  )
}
