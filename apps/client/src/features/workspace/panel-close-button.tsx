import { ArrowLeft01Icon, XIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@/components/ui/button'

export function PanelCloseButton(props: {
  mobile: boolean
  onClick: () => void
}) {
  if (props.mobile) {
    return (
      <Button
        size="icon"
        variant="ghost"
        className="-ml-1"
        title="Back"
        aria-label="Back"
        onClick={props.onClick}
      >
        <HugeiconsIcon
          icon={ArrowLeft01Icon}
          className="text-foreground size-5"
          strokeWidth={2}
        />
      </Button>
    )
  }
  return (
    <Button
      size="icon-sm"
      variant="ghost"
      title="Close"
      aria-label="Close"
      onClick={props.onClick}
    >
      <HugeiconsIcon icon={XIcon} className="size-4" />
    </Button>
  )
}
