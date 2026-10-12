'use client'

import { CheckIcon, CopyIcon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function CopyCommand(props: { className?: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText('npx sshtty')
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  return (
    <Button
      variant="outline"
      onClick={() => void handleCopy()}
      aria-label="Copy npx sshtty"
      className={cn(
        'h-12 gap-3 rounded-xl px-5 font-mono text-base backdrop-blur-md',
        props.className
      )}
    >
      <span className="text-ansi-green">$</span>
      <span>
        npx sshtty
        <span className="animate-blink bg-primary ml-1 inline-block h-[1.1em] w-[0.55em] translate-y-[0.2em] motion-reduce:animate-none" />
      </span>
      {copied ? (
        <CheckIcon className="text-ansi-green" />
      ) : (
        <CopyIcon className="text-muted-foreground" />
      )}
      <span className="sr-only" aria-live="polite">
        {copied ? 'Copied' : ''}
      </span>
    </Button>
  )
}
