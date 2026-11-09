import { type ReactNode, useState } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn, touch } from '@/lib/utils'

export const control =
  'relative inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap rounded-(--control-radius) border border-transparent outline-none hover:bg-accent data-[state=open]:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-64 [&_svg]:pointer-events-none [&_svg]:shrink-0'
export const controlSm =
  'h-7 gap-1.5 px-1.5 text-sm after:absolute after:inset-x-0 after:-inset-y-1 first:after:-left-2 first:after:-right-1.5 last:after:-right-2 font-medium text-secondary-label hover:text-foreground [&_svg:not([class*=text-])]:text-muted-foreground [&_svg:not([class*=size-])]:size-4'

export function keepFocusOnTouch(event: Event) {
  if (touch.matches) {
    event.preventDefault()
  }
}

export function refocusComposer(event: Event) {
  event.preventDefault()
  if (!touch.matches) {
    document.querySelector<HTMLElement>('[data-composer]')?.focus()
  }
}

export function Picker(props: {
  title: string
  shortcut: string[]
  trigger: ReactNode
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  useHotkeys(props.shortcut, () => setOpen(!open), {
    enableOnFormTags: true,
    preventDefault: true,
  })

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={!touch.matches}>
      <DropdownMenuTrigger asChild>
        <button className={cn(control, controlSm)} title={props.title}>
          {props.trigger}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-50"
        side="top"
        align="start"
        onOpenAutoFocus={keepFocusOnTouch}
        onCloseAutoFocus={refocusComposer}
      >
        <DropdownMenuRadioGroup
          value={props.value}
          onValueChange={props.onChange}
        >
          {props.options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
