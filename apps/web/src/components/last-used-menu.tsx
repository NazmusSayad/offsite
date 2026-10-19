import { MoreHorizontalIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react'
import { type ReactNode, useState } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

export type MenuOption = {
  id: string
  label: string
  title: string
  icon: IconSvgElement
  pressed: boolean
  attention: boolean
  badge: ReactNode
  detail: ReactNode
  onSelect: () => void
}

export function LastUsedMenu(props: {
  storageKey: string
  className: string
  buttonClassName: string
  options: [MenuOption, ...MenuOption[]]
}) {
  const [lastId, setLastId] = useState(() =>
    localStorage.getItem(props.storageKey)
  )
  const last =
    props.options.find((option) => option.id === lastId) ?? props.options[0]
  const others = props.options.filter((option) => option !== last)

  function select(option: MenuOption) {
    setLastId(option.id)
    localStorage.setItem(props.storageKey, option.id)
    option.onSelect()
  }

  return (
    <div className={props.className}>
      <button
        className={props.buttonClassName}
        data-pressed={last.pressed}
        aria-label={last.label}
        title={last.title}
        onClick={() => select(last)}
      >
        <HugeiconsIcon icon={last.icon} />
        {last.badge}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(props.buttonClassName, 'data-[state=open]:bg-accent')}
            aria-label="More"
            title="More"
          >
            <HugeiconsIcon icon={MoreHorizontalIcon} />
            {others.some((option) => option.attention) && (
              <span className="bg-muted-foreground ring-background absolute top-0.5 right-0.5 size-1.5 rounded-full ring-2" />
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-44" align="end">
          {others.map((option) => (
            <DropdownMenuItem key={option.id} onSelect={() => select(option)}>
              <HugeiconsIcon icon={option.icon} />
              <span className="flex-1">{option.label}</span>
              {option.detail}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
