import { ArrowLeft01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { GLOBAL_TERMINALS } from '@offsite/core/terminal'
import { Button } from '@/components/ui/button'
import { router } from '@/lib/router'
import { leaveLayer } from '@/lib/url'
import { MachineSwitcher } from './machine-switcher'
import { TerminalPanel } from './panel'

export function TerminalPage(props: { machine: string }) {
  return (
    <main className="bg-background flex min-w-0 flex-1 flex-col overflow-hidden pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <TerminalPanel
        projectId={GLOBAL_TERMINALS}
        tabSize="lg"
        leading={
          <>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Back"
              title="Back"
              onClick={() =>
                leaveLayer(
                  'chat',
                  () =>
                    void router.navigate({ to: '/', search: {}, replace: true })
                )
              }
            >
              <HugeiconsIcon icon={ArrowLeft01Icon} />
            </Button>
            <MachineSwitcher
              machine={props.machine}
              className="text-muted-foreground enabled:hover:text-foreground max-w-48 pr-1.5 text-[13px]"
            />
          </>
        }
      />
    </main>
  )
}
