'use client'

import { CheckIcon, CopyIcon } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

export function CopyCommand(props: { large?: boolean }) {
  const copiedState = useState(false)
  const copied = copiedState[0]

  async function handleCopy() {
    await navigator.clipboard.writeText('npx sshtty')
    copiedState[1](true)
    setTimeout(() => copiedState[1](false), 1600)
  }

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      aria-label="Copy npx sshtty"
      className={cn(
        'focus-visible:ring-ring/50 inline-flex items-center font-mono whitespace-nowrap transition-colors outline-none focus-visible:ring-3',
        !props.large &&
          'bg-foreground text-background hover:bg-foreground/90 h-12 gap-3 rounded-xl px-5 text-base [&_svg]:size-4',
        props.large &&
          'hover:text-primary gap-4 rounded-xl text-4xl tracking-tight sm:text-6xl [&_svg]:size-7 sm:[&_svg]:size-9'
      )}
    >
      <span
        className={cn(
          !props.large && 'opacity-50',
          props.large && 'text-primary'
        )}
      >
        $
      </span>
      npx sshtty
      {copied && <CheckIcon />}
      {!copied && <CopyIcon className="opacity-50" />}
      <span className="sr-only" aria-live="polite">
        {copied ? 'Copied' : ''}
      </span>
    </button>
  )
}
