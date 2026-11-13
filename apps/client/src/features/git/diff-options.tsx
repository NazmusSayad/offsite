import {
  ChevronsDownUpIcon,
  LayoutTwoColumnIcon,
  ArrowExpand01Icon,
  ArrowShrink02Icon,
  Rows3Icon,
  TextWrapIcon,
  UnfoldMoreIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useLocalStorage } from 'usehooks-ts'
import { Button } from '@/components/ui/button'
import {
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import type { Prefs } from '@/lib/prefs'
import { getState, updatePrefs, useStore } from '@/lib/store'
import { useCloseOnBack } from '@/lib/url'

const toggle =
  'text-foreground hover:bg-accent aria-pressed:bg-accent inline-flex h-7 min-w-7 cursor-pointer items-center justify-center rounded-lg px-1.5 [&_svg]:opacity-80'
const segment =
  'text-muted-foreground hover:text-foreground aria-pressed:bg-background aria-pressed:text-foreground dark:aria-pressed:bg-input/72 inline-flex h-6 cursor-pointer items-center justify-center rounded-md px-2.5 aria-pressed:shadow-xs'

function changeDiff(change: Partial<Prefs['diff']>) {
  const prefs = getState().prefs
  updatePrefs({ ...prefs, diff: { ...prefs.diff, ...change } })
}

export function DiffMenuItems(props: { onFullscreen: (() => void) | null }) {
  const diff = useStore((state) => state.prefs.diff)
  const flipped = useLocalStorage<string[]>('diffFlipped', [])

  return (
    <>
      <DropdownMenuItem
        onSelect={() => {
          flipped[1]([])
          changeDiff({ collapsed: !diff.collapsed })
        }}
      >
        <HugeiconsIcon
          icon={diff.collapsed ? UnfoldMoreIcon : ChevronsDownUpIcon}
        />
        {diff.collapsed ? 'Expand all files' : 'Collapse all files'}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuRadioGroup
        value={diff.split ? 'split' : 'stacked'}
        onValueChange={(value) => {
          if (value === 'split') {
            changeDiff({ split: true })
            return
          }
          if (value === 'stacked') {
            changeDiff({ split: false })
            return
          }
          throw new Error(`unknown diff view ${value}`)
        }}
      >
        <DropdownMenuRadioItem value="stacked">
          Stacked view
        </DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="split">Split view</DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
      <DropdownMenuSeparator />
      <DropdownMenuCheckboxItem
        checked={diff.wrap}
        onCheckedChange={(checked) => changeDiff({ wrap: checked })}
      >
        Wrap lines
      </DropdownMenuCheckboxItem>
      {props.onFullscreen !== null && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={props.onFullscreen}>
            <HugeiconsIcon icon={ArrowExpand01Icon} />
            Full screen
          </DropdownMenuItem>
        </>
      )}
    </>
  )
}

export function DiffOptions(props: { collapsible: boolean }) {
  const diff = useStore((state) => state.prefs.diff)
  const flipped = useLocalStorage<string[]>('diffFlipped', [])

  return (
    <>
      {props.collapsible && (
        <Button
          size="icon-sm"
          variant="ghost"
          title={diff.collapsed ? 'Expand all files' : 'Collapse all files'}
          onClick={() => {
            flipped[1]([])
            changeDiff({ collapsed: !diff.collapsed })
          }}
        >
          <HugeiconsIcon
            icon={diff.collapsed ? UnfoldMoreIcon : ChevronsDownUpIcon}
            className="size-4"
          />
        </Button>
      )}
      <div className="bg-input/40 flex shrink-0 items-center rounded-lg p-0.5">
        <button
          className={segment}
          aria-pressed={!diff.split}
          aria-label="Stacked diff view"
          onClick={() => changeDiff({ split: false })}
        >
          <HugeiconsIcon icon={Rows3Icon} className="size-3.5" />
        </button>
        <button
          className={segment}
          aria-pressed={diff.split}
          aria-label="Split diff view"
          onClick={() => changeDiff({ split: true })}
        >
          <HugeiconsIcon icon={LayoutTwoColumnIcon} className="size-3.5" />
        </button>
      </div>
      <button
        className={toggle}
        aria-pressed={diff.wrap}
        title={diff.wrap ? 'Disable line wrapping' : 'Enable line wrapping'}
        onClick={() => changeDiff({ wrap: !diff.wrap })}
      >
        <HugeiconsIcon icon={TextWrapIcon} className="size-3.5" />
      </button>
    </>
  )
}

export function FullscreenButton(props: {
  fullscreen: boolean
  onFullscreen: (fullscreen: boolean) => void
}) {
  useCloseOnBack(props.fullscreen, () => props.onFullscreen(false))
  return (
    <Button
      size="icon-sm"
      variant="ghost"
      title={props.fullscreen ? 'Exit full screen' : 'Full screen'}
      aria-label={props.fullscreen ? 'Exit full screen' : 'Full screen'}
      onClick={() => props.onFullscreen(!props.fullscreen)}
    >
      <HugeiconsIcon
        icon={props.fullscreen ? ArrowShrink02Icon : ArrowExpand01Icon}
        className="size-4"
      />
    </Button>
  )
}
