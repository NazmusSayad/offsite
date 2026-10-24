import { GLOBAL_TERMINALS } from '@offsite/core/terminal'
import type { ReactNode } from 'react'
import { MachineSwitcher } from './machine-switcher'
import { TerminalPanel } from './panel'

export function TerminalPage(props: { machine: string; leading: ReactNode }) {
  return (
    <main className="bg-background flex min-w-0 flex-1 flex-col overflow-hidden pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <TerminalPanel
        projectId={GLOBAL_TERMINALS}
        tabSize="lg"
        leading={
          <>
            {props.leading}
            <MachineSwitcher
              machine={props.machine}
              className="text-muted-foreground enabled:hover:text-foreground max-w-48 px-3 text-[13px]"
            />
          </>
        }
      />
    </main>
  )
}
