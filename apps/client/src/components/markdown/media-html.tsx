import { UnavailableIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'

export function MediaHtml(props: {
  src: string | null
  error: string | null
  alt: string
  name: string
  raw: string
}) {
  if (props.error !== null) {
    return <HtmlUnavailable reason={props.error} raw={props.raw} />
  }
  return (
    <span className="relative my-2 block h-[min(30rem,70dvh)] w-full [&+br]:hidden">
      {props.src === null ? (
        <span className="bg-muted/60 block size-full rounded-lg" />
      ) : (
        <>
          <span className="absolute inset-px rounded-lg bg-white" />
          <iframe
            key={props.src}
            src={props.src}
            title={props.alt === '' ? props.name : props.alt}
            sandbox="allow-scripts allow-forms allow-popups"
            className="relative size-full rounded-lg scheme-light"
          />
        </>
      )}
    </span>
  )
}

function HtmlUnavailable(props: { reason: string; raw: string }) {
  return (
    <span className="border-border/70 text-muted-foreground flex w-fit max-w-full flex-col gap-1 rounded-lg border border-dashed px-3 py-2 text-xs">
      <span className="flex items-start gap-1.5">
        <HugeiconsIcon
          icon={UnavailableIcon}
          aria-hidden
          className="mt-px size-3.5 shrink-0"
        />
        <span>
          <span className="text-foreground/80 font-medium">
            Page unavailable
          </span>
          {` · ${props.reason}`}
        </span>
      </span>
      <span className="text-2xs font-mono break-all opacity-80">
        {props.raw}
      </span>
    </span>
  )
}
