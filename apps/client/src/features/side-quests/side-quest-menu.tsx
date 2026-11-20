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
import { NEW_QUEST, pickSideQuest, questLabel, questStarts } from './ask'

export function SideQuestMenu(props: {
  machine: string
  sessionId: string
  quests: SideQuest[]
  selected: SideQuest | null
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="hover:bg-accent data-[state=open]:bg-accent ml-auto flex h-6 min-w-0 cursor-pointer items-center gap-1 rounded-sm px-1.5 text-xs outline-none">
        <span className="text-muted-foreground truncate">
          {props.selected === null
            ? 'New side quest'
            : questLabel(props.selected)}
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
          selected={props.selected}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function SideQuestMenuItems(props: {
  machine: string
  sessionId: string
  quests: SideQuest[]
  selected: SideQuest | null
}) {
  return (
    <DropdownMenuRadioGroup
      value={props.selected === null ? NEW_QUEST : props.selected.questId}
      onValueChange={(value) =>
        pickSideQuest(props.machine, props.sessionId, value)
      }
    >
      {props.selected === null && (
        <DropdownMenuRadioItem value={NEW_QUEST}>
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
