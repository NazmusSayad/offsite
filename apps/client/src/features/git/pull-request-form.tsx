import { UnfoldMoreIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { PullRequestBranches } from '@offsite/core/git'
import { MoreLabel } from '@/components/icons'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { splitAtLimit } from '@/lib/utils'

export type Draft = {
  base: string
  head: string
  title: string
  body: string
}

export type Target =
  | ({ kind: 'ready' } & PullRequestBranches)
  | { kind: 'failed'; text: string }

export function BaseSelect(props: {
  head: string
  target: Target | undefined
  onBase: (base: string) => void
}) {
  if (props.target?.kind === 'failed') {
    return (
      <span className="text-destructive truncate text-xs">
        {props.target.text}
      </span>
    )
  }
  return (
    <span className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs">
      <span className="truncate">{props.head} →</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="max-w-48"
            disabled={props.target === undefined}
          >
            <span className="truncate">
              {props.target?.base ?? 'Loading branches…'}
            </span>
            <HugeiconsIcon
              icon={UnfoldMoreIcon}
              className="text-muted-foreground size-3.5"
            />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {props.target !== undefined && (
            <BaseItems
              base={props.target.base}
              branches={props.target.branches}
              onBase={props.onBase}
            />
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  )
}

function BaseItems(props: {
  base: string
  branches: string[]
  onBase: (base: string) => void
}) {
  function item(branch: string) {
    return (
      <DropdownMenuRadioItem key={branch} value={branch}>
        <span className="min-w-0 flex-1 truncate">{branch}</span>
      </DropdownMenuRadioItem>
    )
  }

  const list = splitAtLimit(
    props.branches,
    5,
    (branch) => branch === props.base
  )

  return (
    <DropdownMenuRadioGroup value={props.base} onValueChange={props.onBase}>
      {list.shown.map(item)}
      {list.more.length > 0 && (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <MoreLabel
              text={`${list.more.length} more branches`}
              className="size-3.5"
            />
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent className="max-h-80 w-56 overflow-y-auto">
              {list.more.map(item)}
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>
      )}
    </DropdownMenuRadioGroup>
  )
}

export function PullRequestForm(props: {
  draft: Draft
  onChange: (draft: Draft) => void
  onSkip: (() => void) | null
  onRegenerate: () => void
  onCreate: () => void
}) {
  return (
    <div className="flex flex-col gap-2 ps-6">
      <span className="text-muted-foreground truncate text-xs">
        {props.draft.head} → {props.draft.base}
      </span>
      <Input
        value={props.draft.title}
        onChange={(event) =>
          props.onChange({ ...props.draft, title: event.target.value })
        }
      />
      <textarea
        value={props.draft.body}
        onChange={(event) =>
          props.onChange({ ...props.draft, body: event.target.value })
        }
        rows={8}
        className="bg-background focus-visible:border-ring focus-visible:ring-ring/33 w-full resize-y rounded-lg border px-3 py-2 font-mono text-xs transition-[border-color,box-shadow] duration-200 ease-out outline-none focus-visible:ring-3"
      />
      <div className="flex flex-wrap justify-end gap-2">
        {props.onSkip !== null && (
          <Button variant="ghost" size="sm" onClick={props.onSkip}>
            Skip
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={props.onRegenerate}>
          Regenerate
        </Button>
        <Button
          size="sm"
          disabled={props.draft.title.trim() === ''}
          onClick={props.onCreate}
        >
          Create PR
        </Button>
      </div>
    </div>
  )
}
