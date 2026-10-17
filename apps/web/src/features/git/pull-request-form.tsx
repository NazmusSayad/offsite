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
  branches: string[]
  title: string
  body: string
}

export function PullRequestForm(props: {
  draft: Draft
  onChange: (draft: Draft) => void
  onBase: (base: string) => void
  onSkip: (() => void) | null
  onRegenerate: () => void
  onCreate: () => void
}) {
  return (
    <div className="flex flex-col gap-2 ps-6">
      <div className="flex items-center gap-2 text-xs">
        <Select value={props.draft.base} onValueChange={props.onBase}>
          <SelectTrigger size="sm" className="max-w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {props.draft.branches.map((branch) => (
              <SelectItem key={branch} value={branch}>
                {branch}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-muted-foreground truncate">
          ← {props.draft.head}
        </span>
      </div>
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
        className="bg-background focus:border-ring/60 w-full resize-y rounded-lg border px-3 py-2 font-mono text-xs outline-none"
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
