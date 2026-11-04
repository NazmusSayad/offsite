---
name: dialog
description: Builds dialogs, alert dialogs, popovers, hover cards, dropdown menus and context menus in the offsite client so nothing they need runs while they are closed. MUST USE when adding, changing or reviewing any of them, including the component that opens them.
---

## Rule

While closed, a dialog or menu must cost nothing beyond its root and trigger. Everything it needs when open lives in its own content component, rendered **inside** the content element. Radix (`radix-ui`, wrapped in `apps/client/src/components/ui`) does not render the content element while closed, so that component, its hooks and its effects do not exist until the user opens it.

## The component that opens it

- Keeps only the open state and the trigger.
- Passes the content component only what identifies the subject (for example `session`, `machine`, `projectId`) and callbacks such as `onClose` or `onConfirm`.
- Holds no state, hooks, effects, data loading, derived values, handlers or text that only the open dialog or menu uses.

## The content component

- Owns all of that state, hooks, effects, data loading, derived values, handlers and text.
- Is rendered as a child of `DialogContent`, `AlertDialogContent`, `PopoverContent`, `HoverCardContent`, `DropdownMenuContent` or `ContextMenuContent`, never around it.

```tsx
function SessionRow(props: { session: MachineSession }) {
  const [stopping, setStopping] = useState(false)
  return (
    <>
      <button onClick={() => setStopping(true)}>Mark done</button>
      <AlertDialog open={stopping} onOpenChange={setStopping}>
        <AlertDialogContent>
          <StopDialog
            session={props.session}
            onClose={() => setStopping(false)}
          />
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function StopDialog(props: { session: MachineSession; onClose: () => void }) {
  const [stopping, setStopping] = useState(false)
  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>Stop running work?</AlertDialogTitle>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction
          disabled={stopping}
          onClick={async () => {
            setStopping(true)
            await deactivateSession(props.session.machine, props.session.id)
            props.onClose()
          }}
        >
          Stop and Mark Done
        </AlertDialogAction>
      </AlertDialogFooter>
    </>
  )
}
```

## Wrong

- A component that renders the content element itself and is placed inside the root: `<AlertDialog open={stopping}><StopDialog /></AlertDialog>` where `StopDialog` returns `<AlertDialogContent>`. `StopDialog` mounts while closed and its hooks run.
- Hooks, effects or data loading in the opening component that only the open dialog or menu uses.
- `forceMount` or `keepMounted` on any content element.
- Building the dialog's or menu's items, lists or derived data in the opening component and passing them in.

## Lists

Rows, cards and other repeated items must stay light. A row holds one open flag per dialog or menu and nothing else for them.
