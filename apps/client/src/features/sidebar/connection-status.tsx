import { WifiDisconnected02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useShallow } from 'zustand/shallow'
import { getState, showMachineSettings, useStore } from '@/lib/store'
import { cn } from '@/lib/utils'

export function ConnectionStatus(props: { className: string }) {
  const problems = useStore(
    useShallow((state) =>
      state.machines.flatMap((machine) => {
        if (machine.status === 'offline') {
          return [`${machine.name} is not connected`]
        }
        if (machine.status === 'unpaired') {
          return [`${machine.name} needs pairing`]
        }
        return []
      })
    )
  )
  if (problems.length === 0) {
    return null
  }
  const label = problems.join('\n')

  return (
    <button
      className={cn(props.className, '[&>svg]:text-warning')}
      title={label}
      aria-label={label}
      onClick={() => {
        const machine = getState().machines.find(
          (item) => item.status === 'offline' || item.status === 'unpaired'
        )
        if (machine !== undefined) {
          showMachineSettings(machine.id)
        }
      }}
    >
      <HugeiconsIcon icon={WifiDisconnected02Icon} />
    </button>
  )
}
