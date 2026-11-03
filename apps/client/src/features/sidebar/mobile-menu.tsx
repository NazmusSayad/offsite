import { Settings01Icon, SquareTerminalIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { NewTerminalItems } from '@/features/terminal/new-terminal-button'
import { showMachine } from '@/features/terminal/page'
import { showSettings, useStore } from '@/lib/store'
import { cn } from '@/lib/utils'

export function MobileMenu(props: { buttonClassName: string }) {
  const machines = useStore((state) => state.machines)
  const online = machines.filter((machine) => machine.status === 'online')
  const running = online.filter((machine) => machine.terminals.length > 0)
  const last = localStorage.getItem('lastTerminal')
  const terminal = (
    <button
      className={cn(props.buttonClassName, 'size-7 [&>svg]:size-4.5')}
      title="Terminal"
      aria-label="Terminal"
      disabled={online.length === 0}
      onClick={
        running.length > 0
          ? () =>
              showMachine(
                running.find((machine) => machine.id === last) ?? running[0]
              )
          : undefined
      }
    >
      <HugeiconsIcon icon={SquareTerminalIcon} />
    </button>
  )

  return (
    <div className="mr-1.5 flex items-center gap-0.5">
      <button
        className={cn(props.buttonClassName, 'size-7 [&>svg]:size-4.5')}
        title="Settings"
        aria-label="Settings"
        onClick={() => showSettings(true)}
      >
        <HugeiconsIcon icon={Settings01Icon} />
      </button>
      {running.length > 0 ? (
        terminal
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>{terminal}</DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="max-h-80 w-auto min-w-40 overflow-y-auto"
            onCloseAutoFocus={(event) => event.preventDefault()}
          >
            <NewTerminalItems />
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}
