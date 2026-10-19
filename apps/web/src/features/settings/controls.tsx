import { type ReactNode, useState } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export function Section(props: {
  title: string
  note?: string
  children: ReactNode
}) {
  return (
    <section>
      <h2 className="text-muted-foreground mb-2 px-1 text-xs font-medium">
        {props.title}
        {props.note && <span className="font-normal"> · {props.note}</span>}
      </h2>
      <div className="divide-y overflow-hidden rounded-xl border">
        {props.children}
      </div>
    </section>
  )
}

export function Row(props: { label: ReactNode; children: ReactNode }) {
  return (
    <label className="flex min-h-13 flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
      <span className="min-w-0 flex-1 basis-40 text-sm font-medium">
        {props.label}
      </span>
      <div className="max-w-full shrink-0">{props.children}</div>
    </label>
  )
}

export function TextInput(props: {
  value: string
  placeholder?: string
  className?: string
  type?: 'text' | 'number'
  step?: number
  valid?: (text: string) => boolean
  onCommit: (text: string) => void
}) {
  const [text, setText] = useState(props.value)

  function finish() {
    if (text === props.value) {
      return
    }
    if (props.valid && !props.valid(text)) {
      setText(props.value)
      return
    }
    props.onCommit(text)
  }

  return (
    <Input
      className={cn('w-56', props.className)}
      type={props.type}
      min={props.type === 'number' ? 0 : undefined}
      step={props.step}
      placeholder={props.placeholder}
      value={text}
      onChange={(event) => setText(event.target.value)}
      onBlur={finish}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.currentTarget.blur()
        }
      }}
    />
  )
}

export function NumberInput(props: {
  value: number
  step?: number
  onCommit: (value: number) => void
}) {
  return (
    <TextInput
      key={props.value}
      type="number"
      className="w-24"
      step={props.step ?? 1}
      value={String(props.value)}
      valid={(text) => text !== '' && Number(text) >= 0}
      onCommit={(text) => props.onCommit(Number(text))}
    />
  )
}
