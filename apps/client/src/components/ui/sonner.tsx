import {
  Alert02Icon,
  AlertCircleIcon,
  CheckmarkCircle02Icon,
  InformationCircleIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type * as React from 'react'
import { Toaster as Sonner } from 'sonner'

function Toaster(props: React.ComponentProps<typeof Sonner>) {
  return (
    <Sonner
      theme="dark"
      expand
      gap={8}
      offset={16}
      mobileOffset={{
        top: 'calc(env(safe-area-inset-top) + 0.5rem)',
        left: 16,
        right: 16,
      }}
      duration={3000}
      icons={{
        success: <HugeiconsIcon icon={CheckmarkCircle02Icon} />,
        info: <HugeiconsIcon icon={InformationCircleIcon} />,
        warning: <HugeiconsIcon icon={Alert02Icon} />,
        error: <HugeiconsIcon icon={AlertCircleIcon} />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            'text-popover-foreground flex w-(--width) items-start gap-2.5 rounded-lg border px-3 py-2.5 font-sans text-sm shadow-lg',
          default: 'bg-popover',
          error:
            'border-destructive/45 bg-[color-mix(in_srgb,var(--popover)_86%,var(--destructive))] [&_[data-icon]]:text-destructive',
          warning:
            'border-warning/45 bg-[color-mix(in_srgb,var(--popover)_86%,var(--warning))] [&_[data-icon]]:text-warning',
          success:
            'border-success/40 bg-[color-mix(in_srgb,var(--popover)_88%,var(--success))] [&_[data-icon]]:text-success',
          info: 'border-info/40 bg-[color-mix(in_srgb,var(--popover)_88%,var(--info))] [&_[data-icon]]:text-info',
          icon: 'mt-px flex shrink-0 [&>svg]:size-4',
          content: 'grid min-w-0 flex-1 gap-0.5',
          title: 'line-clamp-4 wrap-anywhere whitespace-pre-line',
          description: 'text-muted-foreground text-xs',
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
