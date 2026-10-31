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
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            'bg-popover text-popover-foreground w-(--width) rounded-md border px-3 py-2 font-sans text-sm shadow-md',
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
