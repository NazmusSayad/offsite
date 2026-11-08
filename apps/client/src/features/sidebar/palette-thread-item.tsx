import type { SearchRange } from '@offsite/core/search-match'
import { ProjectIcon } from '@/components/icons'
import { MachineLogo } from '@/constants/machine-icons'
import { timeAgo } from '@/lib/format'
import { Highlighted } from './highlighted'

export function PaletteThreadItem(props: {
  title: string
  titleRanges: SearchRange[]
  project: string
  updatedAt: number | null
  place: { machine: string; projectId: string }
  machines: { id: string; icon: string | null }[]
}) {
  const machine = props.machines.find((item) => item.id === props.place.machine)

  return (
    <>
      <ProjectIcon
        machine={props.place.machine}
        projectId={props.place.projectId}
        className="size-7 shrink-0"
      />
      <span className="min-w-0 flex-1 truncate text-base">
        <Highlighted text={props.title} ranges={props.titleRanges} />
      </span>
      <span className="text-secondary-label text-3xs flex shrink-0 flex-col items-end pl-2 leading-[calc(1/0.75)]">
        {props.updatedAt !== null && (
          <span className="tabular-nums">{timeAgo(props.updatedAt)}</span>
        )}
        <span className="flex items-center gap-[0.5em]">
          {props.project}
          {props.machines.length > 1 && (
            <MachineLogo
              icon={machine?.icon ?? null}
              className="size-[1em] shrink-0"
            />
          )}
        </span>
      </span>
    </>
  )
}
