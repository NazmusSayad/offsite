import { ArrowDown01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { EditorSettings } from '@/features/files/editor-state'

export function ViewSwitcher(props: {
  view: EditorSettings['view']
  label: string
  onView: (view: EditorSettings['view']) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="hover:bg-accent data-[state=open]:bg-accent mr-auto ml-1 flex h-6 min-w-0 cursor-pointer items-center gap-1 rounded-sm px-1 text-[11px] font-bold tracking-wide uppercase outline-none">
        <span className="truncate">{props.label}</span>
        <HugeiconsIcon icon={ArrowDown01Icon} className="size-3.5 shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        <DropdownMenuRadioGroup
          value={props.view}
          onValueChange={(value) => {
            if (value === 'explorer' || value === 'scm') {
              props.onView(value)
            }
          }}
        >
          <DropdownMenuRadioItem value="explorer">
            Explorer
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="scm">
            Source Control
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
