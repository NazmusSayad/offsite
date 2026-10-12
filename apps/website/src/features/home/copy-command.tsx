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
      onClick={() => void handleCopy()}
      aria-label="Copy npx sshtty"
      className={cn(
        'bg-foreground text-background hover:bg-foreground/90 h-12 gap-3 rounded-xl px-5 font-mono text-base',
        props.className
      )}
    >
      <span className="opacity-50">$</span>
      npx sshtty
      {copied ? <CheckIcon /> : <CopyIcon className="opacity-50" />}
      <span className="sr-only" aria-live="polite">
        {copied ? 'Copied' : ''}
      </span>
    </Button>
  )
}
