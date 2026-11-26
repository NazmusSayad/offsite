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
import { changeDiff } from '@/features/git/diff-options'
import { useStore } from '@/lib/store'

export function DiffToolbar(props: {
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
        <DropdownMenuContent align="end" className="bg-popover! w-80">
          <DiffMenu />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function DiffMenu() {
  const diff = useStore((state) => state.prefs.diff)

  return (
    <>
      <DropdownMenuCheckboxItem
        checked={!diff.split}
        onCheckedChange={(checked) => changeDiff({ split: !checked })}
      >
        Inline View
      </DropdownMenuCheckboxItem>
      <DropdownMenuCheckboxItem
        checked={diff.whitespace}
        onCheckedChange={(checked) => changeDiff({ whitespace: checked })}
      >
        Leading/Trailing Whitespace
      </DropdownMenuCheckboxItem>
      <DropdownMenuCheckboxItem
        checked={diff.hideUnchanged}
        onCheckedChange={(checked) => changeDiff({ hideUnchanged: checked })}
      >
        Collapse Unchanged Regions
      </DropdownMenuCheckboxItem>
      <DropdownMenuCheckboxItem
        checked={diff.wrap}
        onCheckedChange={(checked) => changeDiff({ wrap: checked })}
      >
        Word Wrap
      </DropdownMenuCheckboxItem>
    </>
  )
}
