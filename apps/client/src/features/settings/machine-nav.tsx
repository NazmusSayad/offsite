import { Reorder } from 'motion/react'
import { useRef, useState } from 'react'
import { reorderMachines } from '@/api/machines'
import { MachineLogo } from '@/constants/machine-icons'
import { type Machine, showMachineSettings } from '@/lib/store'
import { MachineStatusDot } from './connection'

export function useMachineOrder(machines: Machine[]) {
  const [order, setOrder] = useState<string[] | null>(null)

  return {
    machines:
      order === null
        ? machines
        : order.map((id) => {
            const item = machines.find((candidate) => candidate.id === id)
            if (item === undefined) {
              throw new Error(`Machine ${id} is missing`)
            }
            return item
          }),
    reorder: setOrder,
    save: () => {
      if (order !== null) {
        reorderMachines(order)
      }
      setOrder(null)
    },
  }
}

export function MachineNav(props: { machines: Machine[] }) {
  const list = useMachineOrder(props.machines)
  const dragged = useRef(false)

  return (
    <Reorder.Group
      as="div"
      axis="y"
      className="flex flex-col gap-1"
      values={list.machines.map((item) => item.id)}
      onReorder={list.reorder}
    >
      {list.machines.map((item) => (
        <Reorder.Item
          key={item.id}
          as="button"
          value={item.id}
          className="text-muted-foreground hover:bg-accent hover:text-foreground relative flex h-9 flex-none items-center gap-2 rounded-md px-2 text-sm transition-colors"
          onPointerDown={() => {
            dragged.current = false
          }}
          onKeyDown={() => {
            dragged.current = false
          }}
          onDragStart={() => {
            dragged.current = true
          }}
          onDragEnd={list.save}
          onClick={() => {
            if (!dragged.current) {
              showMachineSettings(item.id)
            }
          }}
        >
          <MachineLogo icon={item.icon} className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate text-left">{item.name}</span>
          <MachineStatusDot status={item.status} />
        </Reorder.Item>
      ))}
    </Reorder.Group>
  )
}
