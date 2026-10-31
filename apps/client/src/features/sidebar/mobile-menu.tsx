import { Menu01Icon, Settings01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { showSettings } from '@/lib/store'

export function MobileMenu(props: { className: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className={props.className} title="Menu" aria-label="Menu">
          <HugeiconsIcon icon={Menu01Icon} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuItem onSelect={() => showSettings(true)}>
          <HugeiconsIcon icon={Settings01Icon} />
          Settings
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
