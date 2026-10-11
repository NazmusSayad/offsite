import { Button } from '@/components/ui/button'

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
            <svg
              viewBox="0 0 48 48"
              className="text-foreground/70 animate-blink size-14 motion-reduce:animate-none"
              aria-hidden
            >
              <rect
                x="11"
                y="6"
                width="26"
                height="36"
                rx="4"
                fill="currentColor"
              />
              <path
                d="M30 15 C27 12 18 12 18 17.5 C18 23.5 30 22 30 29 C30 35 21 36 17.5 33"
                className="stroke-card"
                fill="none"
                strokeWidth={5}
                strokeLinecap="round"
              />
            </svg>
          </span>
        </span>
        <span className="group-hover/button:text-foreground transition-colors">
          {props.label}
        </span>
      </Button>
    </div>
  )
}
