import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

const hexColor = /^#[0-9a-f]{6}$/i

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
    if (text === props.value) return
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
        if (event.key === 'Enter') event.currentTarget.blur()
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

export function ColorInput(props: {
  label: string
  value: string
  onCommit: (value: string) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <Swatch
        label={props.label}
        value={props.value}
        onChange={props.onCommit}
      />
      <TextInput
        key={props.value}
        className="w-24 font-mono uppercase"
        value={props.value}
        valid={(text) => hexColor.test(text)}
        onCommit={props.onCommit}
      />
    </div>
  )
}

export function Swatch(props: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <input
      type="color"
      aria-label={props.label}
      title={`${props.label} ${props.value.toUpperCase()}`}
      className="size-7 cursor-pointer rounded-md border bg-transparent p-0.5 [&::-moz-color-swatch]:rounded-sm [&::-moz-color-swatch]:border-0 [&::-webkit-color-swatch]:rounded-sm [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0"
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
    />
  )
}
