import type { SearchRange } from '@offsite/core/search-match'
import { ProjectIcon } from '@/components/icons'
import { MachineLogo } from '@/constants/machine-icons'
import { timeAgo } from '@/lib/format'
import { Highlighted } from './highlighted'

export function PaletteMessageItem(props: {
  title: string
  snippet: string
  snippetRanges: SearchRange[]
  project: string
  updatedAt: number | null
  place: { machine: string; projectId: string }
  machines: { id: string; icon: string | null }[]
}) {
  const machine = props.machines.find((item) => item.id === props.place.machine)

  return (
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="flex min-w-0 items-center gap-2 text-sm">
        <ProjectIcon
          machine={props.place.machine}
          projectId={props.place.projectId}
          className="size-3.5 shrink-0"
        />
        <span className="min-w-0 truncate">{props.title}</span>
        {props.updatedAt !== null && (
          <span className="text-secondary-label ml-auto shrink-0 pl-2 text-xs tabular-nums">
            {timeAgo(props.updatedAt)}
          </span>
        )}
      </span>
      <span className="text-secondary-label flex min-w-0 items-center gap-1.5 text-xs">
        <span className="min-w-0 truncate">
          <Highlighted text={props.snippet} ranges={props.snippetRanges} />
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5 pl-2">
          {props.project}
          {props.machines.length > 1 && (
            <MachineLogo
              icon={machine?.icon ?? null}
              className="size-3 shrink-0"
            />
          )}
        </span>
      </span>
    </span>
  )
}
