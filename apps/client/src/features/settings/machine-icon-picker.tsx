import { MoreHorizontalIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'
import { editMachine } from '@/api/machines'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  MachineLogo,
  machineIcons,
  quickMachineIcons,
} from '@/constants/machine-icons'
import type { Machine } from '@/lib/store'

export function MachineIconPicker(props: { machine: Machine }) {
  const machine = props.machine
  const selected = machine.icon ?? 'computer'
  const [open, setOpen] = useState(false)

  return (
    <div className="flex min-h-13 items-center justify-between gap-4 px-4 py-2.5">
      <span className="text-sm font-medium">Icon</span>
      <div className="flex items-center gap-1">
        {(quickMachineIcons.includes(selected)
          ? quickMachineIcons
          : [selected, ...quickMachineIcons]
        ).map((icon) => (
          <Button
            key={icon}
            title={icon}
            size="icon-sm"
            aria-pressed={icon === selected}
            variant={icon === selected ? 'default' : 'ghost'}
            onClick={() => editMachine(machine.id, { icon })}
          >
            <MachineLogo icon={icon} />
          </Button>
        ))}
        <Popover open={open} onOpenChange={setOpen} modal>
          <PopoverTrigger asChild>
            <Button title="More icons" size="icon-sm" variant="ghost">
              <HugeiconsIcon icon={MoreHorizontalIcon} />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            collisionPadding={12}
            className="flex max-h-96 w-80 flex-col gap-3 overflow-y-auto p-3"
          >
            {[
              ...new Set(Object.values(machineIcons).map((item) => item.group)),
            ].map((group) => (
              <div key={group} className="flex flex-col gap-1">
                <span className="text-muted-foreground text-xs">{group}</span>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(2rem,1fr))] gap-1">
                  {Object.keys(machineIcons)
                    .filter(
                      (icon) =>
                        machineIcons[icon].group === group &&
                        !quickMachineIcons.includes(icon)
                    )
                    .map((icon) => (
                      <Button
                        key={icon}
                        title={icon}
                        size="icon-sm"
                        className="aspect-square h-auto! w-full!"
                        aria-pressed={icon === selected}
                        variant={icon === selected ? 'default' : 'ghost'}
                        onClick={() => {
                          editMachine(machine.id, { icon })
                          setOpen(false)
                        }}
                      >
                        <MachineLogo
                          icon={icon}
                          className="block aspect-square! h-auto! w-[66%]! min-w-0! shrink-0!"
                        />
                      </Button>
                    ))}
                </div>
              </div>
            ))}
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}
