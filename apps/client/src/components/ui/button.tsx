import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import * as React from 'react'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "relative inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-[var(--control-radius)] border text-sm font-medium whitespace-nowrap outline-none transition-[box-shadow,scale] select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:pointer-events-none disabled:opacity-64 [&:active:not([aria-haspopup])]:scale-[0.97] [&_svg]:pointer-events-none [&_svg]:-mx-0.5 [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          'border-primary bg-primary text-primary-foreground shadow-xs shadow-primary/24 not-disabled:inset-shadow-[0_1px_rgb(255_255_255/16%)] hover:bg-primary/90 active:shadow-none',
        outline:
          'border-input bg-popover text-foreground shadow-xs/5 hover:bg-accent/50 dark:bg-input/32 dark:hover:bg-input/64 [&_svg:not([class*=text-])]:text-muted-foreground',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/90 dark:bg-input/32 dark:hover:bg-input/64',
        ghost:
          'border-transparent text-foreground hover:bg-accent aria-expanded:bg-accent [&_svg:not([class*=text-])]:text-muted-foreground',
        'ghost-muted':
          'border-transparent text-muted-foreground hover:bg-accent hover:text-foreground aria-expanded:bg-accent',
        destructive:
          'border-transparent bg-destructive/90 text-white shadow-xs shadow-destructive/24 hover:bg-destructive',
      },
      size: {
        default: 'h-9 gap-1.5 px-[calc(--spacing(2.5)-1px)]',
        sm: 'h-8 gap-1.5 px-[calc(--spacing(2.5)-1px)]',
        xs: "h-7 gap-1 px-[calc(--spacing(2)-1px)] text-xs [&_svg:not([class*='size-'])]:size-3.5",
        icon: 'size-9',
        'icon-sm': 'size-8',
        'icon-xs': "size-7 [&_svg:not([class*='size-'])]:size-3.5",
        'icon-micro': 'size-6 rounded-sm p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : 'button'

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
