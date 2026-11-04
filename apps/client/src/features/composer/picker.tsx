import { DropdownMenu as DropdownMenuPrimitive } from 'radix-ui'
import { type ReactNode, useState } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  focusCheckedItem,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { moveFocus } from './move-focus'
import { sector } from './sector'

export const control =
  'relative inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap rounded-(--control-radius) border border-transparent outline-none hover:bg-accent data-[state=open]:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-64 [&_svg]:pointer-events-none [&_svg]:shrink-0'
export const controlSm =
  'h-7 gap-1.5 px-1.5 text-sm font-medium text-secondary-label hover:text-foreground [&_svg:not([class*=text-])]:text-muted-foreground [&_svg:not([class*=size-])]:size-4'

export function Picker(props: {
  title: string
  shortcut: string[]
  trigger: ReactNode
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}) {
  const radius = Math.min(190, (window.innerWidth - 16) / 2)
  const [open, setOpen] = useState(false)
  useHotkeys(props.shortcut, () => setOpen(!open), {
    enableOnFormTags: true,
    preventDefault: true,
  })

  return (
    <DropdownMenu
      modal={props.options.length > 5}
      open={open}
      onOpenChange={setOpen}
    >
      <DropdownMenuTrigger asChild>
        <button className={cn(control, controlSm)} title={props.title}>
          {props.trigger}
        </button>
      </DropdownMenuTrigger>
      {props.options.length > 5 && (
        <DropdownMenuContent
          className="w-72"
          side="top"
          align="start"
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            document.querySelector<HTMLElement>('[data-composer]')?.focus()
          }}
        >
          <PickerItems
            value={props.value}
            options={props.options}
            radius={radius}
            onChange={props.onChange}
          />
        </DropdownMenuContent>
      )}
      {props.options.length <= 5 && (
        <DropdownMenuPrimitive.Portal>
          <DropdownMenuPrimitive.Content
            data-slot="dropdown-menu-content"
            side="top"
            sideOffset={-28}
            className="data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 pointer-events-none relative z-50 origin-(--radix-dropdown-menu-content-transform-origin) drop-shadow-[0_12px_28px_rgb(0_0_0/45%)] duration-100 outline-none"
            style={{ width: radius * 2, height: radius }}
            {...{ onOpenAutoFocus: focusCheckedItem }}
            onKeyDown={(event) =>
              moveFocus(
                event,
                'ArrowLeft',
                'ArrowRight',
                '[role=menuitemradio]'
              )
            }
            onCloseAutoFocus={(event) => {
              event.preventDefault()
              document.querySelector<HTMLElement>('[data-composer]')?.focus()
            }}
          >
            <PickerItems
              value={props.value}
              options={props.options}
              radius={radius}
              onChange={props.onChange}
            />
          </DropdownMenuPrimitive.Content>
        </DropdownMenuPrimitive.Portal>
      )}
    </DropdownMenu>
  )
}

function PickerItems(props: {
  value: string
  options: { value: string; label: string }[]
  radius: number
  onChange: (value: string) => void
}) {
  if (props.options.length > 5) {
    return (
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
    )
  }

  return (
    <>
      <div
        className="bg-background pointer-events-auto absolute"
        style={
          sector(props.radius, props.radius * 0.35, props.radius, 0, Math.PI)
            .style
        }
      />
      <DropdownMenuPrimitive.RadioGroup
        value={props.value}
        onValueChange={props.onChange}
      >
        {props.options.map((option, index) => {
          const shape = sector(
            props.radius,
            props.radius * 0.35,
            props.radius,
            Math.PI - ((index + 1) * Math.PI) / props.options.length,
            Math.PI - (index * Math.PI) / props.options.length
          )
          return (
            <DropdownMenuPrimitive.RadioItem
              key={option.value}
              value={option.value}
              className={cn(
                'pointer-events-auto absolute cursor-pointer transition-colors outline-none',
                option.value === props.value &&
                  'text-foreground bg-[color-mix(in_srgb,var(--primary)_30%,var(--popover))]',
                option.value !== props.value &&
                  'bg-popover text-secondary-label data-highlighted:bg-accent data-highlighted:text-accent-foreground'
              )}
              style={shape.style}
            >
              <span
                className="absolute -translate-x-1/2 -translate-y-1/2 text-sm font-medium whitespace-nowrap"
                style={shape.center}
              >
                {option.label}
              </span>
            </DropdownMenuPrimitive.RadioItem>
          )
        })}
      </DropdownMenuPrimitive.RadioGroup>
    </>
  )
}
