import { Button } from '@/components/ui/button'

import logoSvg from './logo.svg?raw'

export function EmptyState(props: { label: string; onClick: () => void }) {
  return (
    <div className="absolute inset-0 grid place-items-center">
      <Button
        variant="ghost"
        className="text-muted-foreground h-auto flex-col gap-6 rounded-3xl px-14 py-10 text-lg font-normal hover:bg-transparent dark:hover:bg-transparent"
        onClick={props.onClick}
      >
        <span className="relative grid place-items-center">
          <span className="bg-primary/25 animate-breathe absolute size-36 rounded-full blur-3xl motion-reduce:animate-none" />
          <span className="bg-card animate-float group-hover/button:border-primary/40 relative grid size-28 place-items-center rounded-3xl border shadow-2xl transition-colors motion-reduce:animate-none">
            <span
              className="text-foreground/70 [&_rect:last-child]:animate-blink size-14 motion-reduce:[&_rect:last-child]:animate-none [&>svg]:size-full"
              dangerouslySetInnerHTML={{ __html: logoSvg }}
              aria-hidden
            />
          </span>
        </span>
        <span className="group-hover/button:text-foreground transition-colors">
          {props.label}
        </span>
      </Button>
    </div>
  )
}
