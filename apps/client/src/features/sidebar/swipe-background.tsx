import {
  ArrowExpandDiagonal01Icon,
  MinimizeIcon,
  PinOffIcon,
  PlayIcon,
  SunriseIcon,
  TickDouble01Icon,
  ZzzIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react'
import type { MachineSession } from '@/lib/store'
import { cn } from '@/lib/utils'

export const swipeThreshold = 0.4

export const secondarySwipe = {
  active: { status: 'snoozed', icon: ZzzIcon, color: '#c678dd' },
  snoozed: { status: 'active', icon: SunriseIcon, color: '#d19a66' },
  minimized: {
    status: 'active',
    icon: ArrowExpandDiagonal01Icon,
    color: 'var(--info)',
  },
  inactive: { status: 'minimized', icon: MinimizeIcon, color: '#5c6370' },
  pinned: { status: 'active', icon: PinOffIcon, color: '#e06c75' },
} as const satisfies Record<
  MachineSession['status'],
  { status: MachineSession['status']; icon: IconSvgElement; color: string }
>

export function SwipeBackground(props: {
  status: MachineSession['status']
  offset: number
  width: number
  className: string
}) {
  const action =
    props.offset < 0
      ? secondarySwipe[props.status]
      : props.status === 'inactive'
        ? { icon: PlayIcon, color: '#56b6c2' }
        : { icon: TickDouble01Icon, color: 'var(--success)' }
  const armed = Math.abs(props.offset) > props.width * swipeThreshold
  const progress = Math.min(
    Math.abs(props.offset) / (props.width * swipeThreshold),
    1
  )
  return (
    <div
      className={cn(
        'absolute flex items-center rounded-md px-2.5 transition-colors duration-150',
        props.className,
        props.offset < 0 && 'justify-end'
      )}
      style={{
        backgroundColor: armed
          ? action.color
          : `color-mix(in srgb, ${action.color} 15%, transparent)`,
        color: armed ? 'white' : action.color,
      }}
    >
      <div
        className={cn(
          'relative grid aspect-square h-[calc(100%-4px)] max-h-11 place-items-center transition-transform duration-200 ease-[cubic-bezier(.34,1.8,.64,1)]',
          armed && 'scale-110'
        )}
      >
        <svg viewBox="0 0 44 44" className="absolute inset-0 -rotate-90">
          <circle
            cx="22"
            cy="22"
            r="18"
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.3}
            strokeWidth="3"
          />
          <circle
            cx="22"
            cy="22"
            r="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={1 - progress}
          />
        </svg>
        <HugeiconsIcon icon={action.icon} className="size-5" />
      </div>
    </div>
  )
}
