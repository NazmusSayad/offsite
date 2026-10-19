import {
  Menu01Icon,
  MinimizeIcon,
  Plug01Icon,
  PlugZapIcon,
  Settings01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { showSettings } from '@/lib/store'

export type ThreadFilter = 'active' | 'minimized' | 'inactive'

export function MobileMenu(props: {
  className: string
  filter: ThreadFilter
  onFilter: (filter: ThreadFilter) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className={props.className} title="Menu" aria-label="Menu">
          <HugeiconsIcon icon={Menu01Icon} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuRadioGroup value={props.filter}>
          {(
            [
              ['active', PlugZapIcon],
              ['minimized', MinimizeIcon],
              ['inactive', Plug01Icon],
            ] as const
          ).map(([filter, icon]) => (
            <DropdownMenuRadioItem
              key={filter}
              value={filter}
              className="capitalize"
              onSelect={() => props.onFilter(filter)}
            >
              <HugeiconsIcon icon={icon} />
              {filter}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => showSettings(true)}>
          <HugeiconsIcon icon={Settings01Icon} />
          Settings
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
