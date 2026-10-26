import {
  ArrowDown02Icon,
  ArrowUp02Icon,
  FileExportIcon,
  MoreHorizontalIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { EditorSettings } from '@/features/files/editor-state'

export function DiffToolbar(props: {
  settings: EditorSettings
  onSettings: (change: Partial<EditorSettings>) => void
  onOpenFile: () => void
  onPrevious: () => void
  onNext: () => void
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5 pl-1.5">
      <Button
        size="icon-micro"
        variant="ghost"
        title="Open File"
        aria-label="Open File"
        onClick={props.onOpenFile}
      >
        <HugeiconsIcon icon={FileExportIcon} className="size-4" />
      </Button>
      <Button
        size="icon-micro"
        variant="ghost"
        title="Previous Change"
        aria-label="Previous Change"
        onClick={props.onPrevious}
      >
        <HugeiconsIcon icon={ArrowUp02Icon} className="size-4" />
      </Button>
      <Button
        size="icon-micro"
        variant="ghost"
        title="Next Change"
        aria-label="Next Change"
        onClick={props.onNext}
      >
        <HugeiconsIcon icon={ArrowDown02Icon} className="size-4" />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon-micro"
            variant="ghost"
            title="More Actions..."
            aria-label="More Actions"
          >
            <HugeiconsIcon icon={MoreHorizontalIcon} className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80">
          <DropdownMenuCheckboxItem
            checked={props.settings.inline}
            onCheckedChange={(checked) => props.onSettings({ inline: checked })}
          >
            Inline View
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={props.settings.whitespace}
            onCheckedChange={(checked) =>
              props.onSettings({ whitespace: checked })
            }
          >
            Show Leading/Trailing Whitespace Differences
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={props.settings.collapse}
            onCheckedChange={(checked) =>
              props.onSettings({ collapse: checked })
            }
          >
            Collapse Unchanged Regions
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
