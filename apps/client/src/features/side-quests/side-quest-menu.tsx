import { ArrowDown01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { SideQuest } from '@offsite/core/side-quests'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { pickSideQuest, questLabel, questStarts } from './ask'

export function SideQuestMenu(props: {
  machine: string
  sessionId: string
  quests: SideQuest[]
  questId: string
  start: SideQuest | undefined
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="hover:bg-accent data-[state=open]:bg-accent ml-auto flex h-6 min-w-0 cursor-pointer items-center gap-1 rounded-sm px-1.5 text-xs outline-none">
        <span className="text-muted-foreground truncate">
          {props.start === undefined
            ? 'New side quest'
            : questLabel(props.start)}
        </span>
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          className="text-muted-foreground size-3.5 shrink-0"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-popover! w-72">
        <SideQuestMenuItems
          machine={props.machine}
          sessionId={props.sessionId}
          quests={props.quests}
          questId={props.questId}
          started={props.start !== undefined}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function SideQuestMenuItems(props: {
  machine: string
  sessionId: string
  quests: SideQuest[]
  questId: string
  started: boolean
}) {
  return (
    <DropdownMenuRadioGroup
      value={props.questId}
      onValueChange={(value) =>
        pickSideQuest(props.machine, props.sessionId, value)
      }
    >
      {!props.started && (
        <DropdownMenuRadioItem value={props.questId}>
          New side quest
        </DropdownMenuRadioItem>
      )}
      {questStarts(props.quests)
        .reverse()
        .map((quest) => (
          <DropdownMenuRadioItem key={quest.questId} value={quest.questId}>
            <span className="truncate">{questLabel(quest)}</span>
          </DropdownMenuRadioItem>
        ))}
    </DropdownMenuRadioGroup>
  )
}
