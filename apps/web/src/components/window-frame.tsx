import { clsx } from 'clsx'
import type { ReactNode } from 'react'

export function BrowserFrame(props: {
  className?: string
  children: ReactNode
}) {
  return (
    <div className={clsx('frame', props.className)}>
      <div className="flex h-9 items-center gap-3 border-b border-white/8 bg-[#0d1014] px-4">
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="size-2.5 rounded-full bg-white/12" />
          <span className="size-2.5 rounded-full bg-white/12" />
          <span className="size-2.5 rounded-full bg-white/12" />
        </span>
        <span className="mx-auto rounded-md bg-white/5 px-10 py-0.5 font-mono text-[11px] text-[#7d838c] sm:px-16">
          127.0.0.1:47841
        </span>
      </div>
      {props.children}
    </div>
  )
}

export function TerminalFrame(props: {
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={clsx(
        'frame bg-[#0d1014] font-mono text-[13px] text-[#f1f2f4]',
        props.className
      )}
    >
      <div className="flex h-9 items-center gap-2 border-b border-white/8 px-4 text-xs text-[#7d838c]">
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="size-2.5 rounded-full bg-white/12" />
          <span className="size-2.5 rounded-full bg-white/12" />
          <span className="size-2.5 rounded-full bg-white/12" />
        </span>
        <span className="ml-2">zsh</span>
      </div>
      <div className="px-4 py-3 leading-6">{props.children}</div>
    </div>
  )
}
