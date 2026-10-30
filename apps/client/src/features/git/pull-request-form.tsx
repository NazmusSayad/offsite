import type { PullRequestBranches } from '@offsite/core/git'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

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
      <Select
        value={props.target?.base ?? ''}
        disabled={props.target === undefined}
        onValueChange={props.onBase}
      >
        <SelectTrigger size="sm" className="max-w-48">
          <SelectValue placeholder="Loading branches…" />
        </SelectTrigger>
        <SelectContent>
          {(props.target?.branches ?? []).map((branch) => (
            <SelectItem key={branch} value={branch}>
              {branch}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </span>
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
