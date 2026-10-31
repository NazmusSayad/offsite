import { machineKey } from '@/api/machines'
import { type MachineSession, useStore } from '@/lib/store'
import { cn } from '@/lib/utils'

export function SessionTitle(props: { session: MachineSession }) {
  const generating = useStore((state) =>
    state.generatingTitles.includes(
      machineKey(props.session.machine, props.session.id)
    )
  )

  return (
    <span className={cn(generating && 'text-shimmer')}>
      {props.session.title}
    </span>
  )
}
