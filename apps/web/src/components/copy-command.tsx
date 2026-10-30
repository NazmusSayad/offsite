import { CheckIcon, CopyIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'

export function CopyCommand() {
  const [copied, setCopied] = useState(false)

  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText('npx offsite')
        setCopied(true)
        setTimeout(() => setCopied(false), 1600)
      }}
      className="bg-foreground text-background flex h-11 cursor-pointer items-center gap-3 rounded-full pr-4 pl-5 font-mono text-sm font-medium transition hover:bg-white active:scale-[0.98]"
    >
      <span>
        <span className="text-background/45">$</span> npx offsite
      </span>
      <HugeiconsIcon
        icon={copied ? CheckIcon : CopyIcon}
        className="text-background/60 size-4"
      />
      <span className="sr-only">{copied ? 'Copied' : 'Copy command'}</span>
    </button>
  )
}
