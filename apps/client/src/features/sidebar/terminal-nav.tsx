import {
  Add01Icon,
  ChevronRightIcon,
  Delete02Icon,
  SquareTerminalIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { closeTabs } from "@/features/terminal/close-tab";
import { CloseAllDialog } from "@/features/terminal/dialogs";
import {
  NewTerminalButton,
  NewTerminalItems,
} from "@/features/terminal/new-terminal-button";
import { TerminalGroups } from "@/features/terminal/terminal-page";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export function TerminalNav(props: {
  buttonClassName: string;
  mobile: boolean;
}) {
  const machines = useStore((state) => state.machines);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const terminals = machines.reduce(
    (total, machine) => total + machine.terminals.length,
    0,
  );
  const active = machines.some(
    (machine) => machine.status === "online" && machine.terminals.length > 0,
  );
  const online = machines.some((machine) => machine.status === "online");

  if (machines.length === 0) {
    return null;
  }

  const button = (
    <button
      className={cn(
        props.buttonClassName,
        "group-hover/terminal:text-sidebar-foreground group-hover/terminal:[&>svg]:text-sidebar-foreground group-has-[[data-state=open]]/terminal:text-sidebar-foreground group-has-[[data-state=open]]/terminal:[&>svg]:text-sidebar-foreground h-8 w-full justify-start gap-2 px-2.5 text-sm",
      )}
      title="Terminal"
      onClick={active ? () => setGroupsOpen(true) : undefined}
    >
      <HugeiconsIcon icon={SquareTerminalIcon} />
      Terminal
      {terminals > 0 && (
        <span
          className={cn(
            "text-foreground/75 ml-auto grid h-4 min-w-4 place-items-center rounded-full bg-[color-mix(in_srgb,var(--foreground)_8%,var(--background))] px-1 text-[10px] leading-none font-medium tabular-nums",
            online &&
              "group-hover/terminal:invisible group-has-[[data-state=open]]/terminal:invisible",
            active && "pointer-coarse:invisible",
          )}
        >
          {terminals}
        </span>
      )}
      {active && (
        <HugeiconsIcon
          icon={ChevronRightIcon}
          aria-hidden
          className="text-muted-foreground absolute right-2.5 size-4 opacity-0 group-hover/terminal:opacity-100 group-has-[[data-state=open]]/terminal:opacity-100 pointer-coarse:opacity-100"
        />
      )}
    </button>
  );

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild disabled={!online}>
          <div className="group/terminal hover:bg-sidebar-row-hover has-[[data-state=open]]:bg-sidebar-row-hover data-[state=open]:bg-sidebar-row-hover relative rounded-[var(--control-radius)]">
            {active ? (
              <HoverCard
                open={groupsOpen}
                onOpenChange={setGroupsOpen}
                openDelay={100}
              >
                <HoverCardTrigger asChild>{button}</HoverCardTrigger>
                <HoverCardContent
                  side="right"
                  align="end"
                  className="w-56 p-1"
                  onClick={() => setGroupsOpen(false)}
                >
                  <TerminalGroups />
                </HoverCardContent>
              </HoverCard>
            ) : (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild disabled={!online}>
                    {button}
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    side="bottom"
                    align="start"
                    className="max-h-80 w-(--radix-dropdown-menu-trigger-width) overflow-y-auto"
                    onCloseAutoFocus={(event) => event.preventDefault()}
                  >
                    <NewTerminalItems />
                  </DropdownMenuContent>
                </DropdownMenu>
                <NewTerminalButton mobile={props.mobile} />
              </>
            )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <HugeiconsIcon icon={Add01Icon} />
              New terminal
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="max-h-80 overflow-y-auto">
              <NewTerminalItems contextMenu />
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuItem
            variant="destructive"
            disabled={!active}
            onSelect={() =>
              void closeTabs(
                machines
                  .filter((machine) => machine.status === "online")
                  .flatMap((machine) =>
                    machine.terminals.map((tab) => ({
                      machine: machine.id,
                      id: tab.id,
                    })),
                  ),
              )
            }
          >
            <HugeiconsIcon icon={Delete02Icon} />
            Close All
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      <CloseAllDialog />
    </>
  );
}
