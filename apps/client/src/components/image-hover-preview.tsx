import { type ReactElement, useState } from 'react'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card'
import { touch } from '@/lib/utils'

export function ImageHoverPreview(props: {
  src: string | null
  alt: string
  onOpen: () => void
  children: ReactElement
}) {
  const [open, setOpen] = useState(false)
  return (
    <HoverCard
      open={open}
      onOpenChange={(next) => {
        if (next && touch.matches) {
          return
        }
        setOpen(next)
      }}
      openDelay={150}
      closeDelay={50}
    >
      <HoverCardTrigger asChild onClick={() => setOpen(false)}>
        {props.children}
      </HoverCardTrigger>
      {props.src !== null && (
        <HoverCardContent className="bg-transparent! p-0 shadow-[0_24px_64px_-12px_rgb(0_0_0/60%)] backdrop-filter-none! dark:shadow-[0_24px_64px_-12px_rgb(0_0_0/85%)]">
          <button
            type="button"
            className="block cursor-zoom-in"
            onClick={() => {
              setOpen(false)
              props.onOpen()
            }}
          >
            <img
              src={props.src}
              alt={props.alt}
              className="block max-h-[min(30rem,70dvh)] max-w-[min(30rem,90vw)] rounded-lg object-contain"
            />
          </button>
        </HoverCardContent>
      )}
    </HoverCard>
  )
}
