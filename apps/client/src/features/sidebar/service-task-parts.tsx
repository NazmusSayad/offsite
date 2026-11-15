import type { ReactNode } from 'react'

export function TaskLine(props: {
  name: string
  detail: string | null
  action: ReactNode
}) {
  return (
    <div className="flex min-h-7 items-center gap-2">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-sidebar-foreground truncate text-[0.8125rem] font-medium">
          {props.name}
        </span>
        {props.detail !== null && (
          <span className="text-muted-foreground truncate text-xs tabular-nums">
            {props.detail}
          </span>
        )}
      </div>
      {props.action}
    </div>
  )
}

export function TaskError(props: { error: string | null }) {
  if (props.error === null) {
    return null
  }

  return (
    <p className="text-destructive mt-1.5 text-xs wrap-anywhere">
      {props.error}
    </p>
  )
}

export function TaskBusy(props: { busy: string[] | null }) {
  if (props.busy === null || props.busy.length === 0) {
    return null
  }

  return (
    <div className="bg-destructive/10 mt-2 rounded-md px-2 py-1.5 text-xs">
      <p className="text-destructive font-medium">Restarting stops:</p>
      <ul className="text-muted-foreground mt-0.5 list-disc pl-4 wrap-anywhere">
        {props.busy.map((reason, index) => (
          <li key={`${index} ${reason}`}>{reason}</li>
        ))}
      </ul>
    </div>
  )
}
