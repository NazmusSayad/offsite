import { useEffect, useRef } from 'react'

export function NameInput(props: {
  initial: string
  onCommit: (value: string) => void
  onCancel: () => void
}) {
  const done = useRef(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const dot = props.initial.lastIndexOf('.')
    input.current?.focus()
    input.current?.setSelectionRange(0, dot > 0 ? dot : props.initial.length)
  }, [props.initial])

  return (
    <input
      ref={input}
      aria-label="Name"
      defaultValue={props.initial}
      className="border-primary bg-background text-foreground h-5 min-w-0 flex-1 border px-1 text-[13px] outline-none"
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          done.current = true
          props.onCommit(event.currentTarget.value)
        }
        if (event.key === 'Escape') {
          done.current = true
          props.onCancel()
        }
      }}
      onBlur={(event) => {
        if (!done.current) {
          done.current = true
          props.onCommit(event.currentTarget.value)
        }
      }}
    />
  )
}
