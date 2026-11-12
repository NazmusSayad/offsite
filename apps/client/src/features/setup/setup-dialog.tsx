import { Cancel01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { DialogClose, DialogTitle } from '@/components/ui/dialog'
import { ServiceForm } from '@/features/service/service-form'
import { type Machine, useStore } from '@/lib/store'
import { cn } from '@/lib/utils'

export function needsSetup(machine: Machine) {
  return (
    machine.status === 'online' &&
    machine.service !== null &&
    (!machine.service.installed || machine.service.update !== null)
  )
}

function taskLabel(machine: Machine) {
  return machine.service?.installed
    ? `Update OffSite - ${machine.name}`
    : `Install OffSite - ${machine.name}`
}

export function SetupPanel(props: { onClose: () => void }) {
  const machines = useStore((state) => state.machines)
  const tasks = machines.filter(needsSetup)
  const [picked, setPicked] = useState<string | null>(null)
  const task =
    tasks.find((machine) => machine.id === picked) ?? tasks.at(0) ?? null

  return (
    <>
      <nav className="flex flex-none gap-1 overflow-x-auto border-b p-3 sm:w-56 sm:flex-col sm:border-r sm:border-b-0">
        <DialogTitle className="hidden px-2 pt-1 pb-3 text-base font-semibold sm:block">
          Set up
        </DialogTitle>
        {tasks.map((machine) => (
          <button
            key={machine.id}
            className={cn(
              'text-muted-foreground hover:bg-accent hover:text-foreground flex h-9 flex-none items-center rounded-md px-2 text-left text-sm transition-colors',
              machine.id === task?.id && 'bg-accent text-foreground'
            )}
            onClick={() => setPicked(machine.id)}
          >
            <span className="truncate">{taskLabel(machine)}</span>
          </button>
        ))}
      </nav>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-4 pb-7">
        <div className="mb-5 flex h-9 items-center">
          <h2 className="truncate text-xl font-semibold tracking-tight">
            {task === null ? 'All set' : taskLabel(task)}
          </h2>
          <DialogClose asChild>
            <Button
              variant="ghost"
              size="icon"
              className="-mr-2 ml-auto"
              aria-label="Close"
            >
              <HugeiconsIcon icon={Cancel01Icon} />
            </Button>
          </DialogClose>
        </div>
        {task !== null && (
          <ServiceForm
            key={task.id}
            machine={task.id}
            update={task.service?.installed === true}
            onDone={props.onClose}
          />
        )}
      </div>
    </>
  )
}
