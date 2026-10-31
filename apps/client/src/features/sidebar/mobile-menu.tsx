import { Menu01Icon, Settings01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { TerminalNav } from '@/features/sidebar/terminal-nav'
import { showSettings } from '@/lib/store'
import { cn } from '@/lib/utils'

export function MobileMenu(props: { buttonClassName: string }) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(props.buttonClassName, 'size-7')}
          title="Menu"
          aria-label="Menu"
        >
          <HugeiconsIcon icon={Menu01Icon} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        role="group"
        aria-label="Menu"
        className="flex w-56 flex-col gap-px p-1"
      >
        <TerminalNav
          buttonClassName={cn(
            props.buttonClassName,
            'text-popover-foreground [&>svg]:text-popover-foreground'
          )}
          mobile
        />
        <button
          className={cn(
            props.buttonClassName,
            'text-popover-foreground [&>svg]:text-popover-foreground h-8 w-full justify-start gap-2 px-2.5 text-sm'
          )}
          onClick={() => {
            setOpen(false)
            showSettings(true)
          }}
        >
          <HugeiconsIcon icon={Settings01Icon} />
          Settings
        </button>
      </PopoverContent>
    </Popover>
  )
}
