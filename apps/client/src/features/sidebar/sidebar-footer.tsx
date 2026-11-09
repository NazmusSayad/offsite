import {
  DashboardSpeed02Icon,
  Settings01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { StatusChips } from '@/features/sidebar/status-chips'
import { TerminalNav } from '@/features/sidebar/terminal-nav'
import { UsageMeters } from '@/features/usage/usage-meters'
import { showSettings, showUsage } from '@/lib/store'
import { cn } from '@/lib/utils'

export function SidebarFooter(props: { buttonClassName: string }) {
  return (
    <div className="border-sidebar-border @container flex shrink-0 flex-col gap-px border-t p-(--sidebar-content-inset)">
      <TerminalNav buttonClassName={props.buttonClassName} />
      <div className="relative">
        <button
          className={cn(
            props.buttonClassName,
            'h-8 w-full justify-start gap-2 px-2.5 text-sm'
          )}
          title="Usage"
          onClick={() => showUsage(true)}
        >
          <HugeiconsIcon icon={DashboardSpeed02Icon} />
          <span className="truncate">Usage</span>
        </button>
        <div className="absolute top-1.5 right-1.5">
          <UsageMeters />
        </div>
      </div>
      <div className="relative">
        <button
          className={cn(
            props.buttonClassName,
            'h-8 w-full justify-start gap-2 px-2.5 text-sm'
          )}
          title="Settings"
          onClick={() => showSettings(true)}
        >
          <HugeiconsIcon icon={Settings01Icon} />
          <span className="truncate">Settings</span>
        </button>
        <div className="absolute top-1.5 right-1.5">
          <StatusChips className="@max-[13rem]:hidden" hideDone={false} />
          <StatusChips
            className="hidden @max-[13rem]:flex"
            hideDone={false}
            collapsed
          />
        </div>
      </div>
    </div>
  )
}
