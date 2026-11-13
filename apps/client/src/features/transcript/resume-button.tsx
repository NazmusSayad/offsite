import { PlayIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { sendPrompt } from '@/lib/sessions'
import { getState, showError } from '@/lib/store'

export function ResumeButton() {
  return (
    <Tooltip label="Resume">
      <Button
        type="button"
        size="icon-micro"
        variant="ghost-muted"
        className="size-5"
        aria-label="Resume"
        onClick={() =>
          sendPrompt(
            crypto.randomUUID(),
            { text: 'resume', images: [] },
            'queue',
            getState().selection,
            null
          ).catch(showError)
        }
      >
        <HugeiconsIcon icon={PlayIcon} className="size-3.5" />
      </Button>
    </Tooltip>
  )
}
