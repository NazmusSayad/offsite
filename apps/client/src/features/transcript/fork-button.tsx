import { GitForkIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { forkFrom } from '@/lib/sessions'
import { cn } from '@/lib/utils'

export function ForkButton(props: { uuid: string }) {
  const [busy, setBusy] = useState(false)
  return (
    <Tooltip label="Fork from this response">
      <Button
        type="button"
        size="icon-micro"
        variant="ghost-muted"
        disabled={busy}
        aria-label="Fork from this response"
        onClick={() => {
          setBusy(true)
          void forkFrom(props.uuid).finally(() => setBusy(false))
        }}
      >
        <HugeiconsIcon
          icon={GitForkIcon}
          className={cn('size-4', busy && 'animate-pulse')}
        />
      </Button>
    </Tooltip>
  )
}
