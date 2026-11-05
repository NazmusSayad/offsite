import { AiMicIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { PromptDelivery } from '@offsite/core/config'
import { useEffect, useState } from 'react'
import { useStore } from '@/lib/store'
import { mod } from '@/lib/utils'
import type { ActiveDictation, Dictation } from './dictation-button'
import { DictationPill } from './dictation-pill'

const wide = window.matchMedia('(min-width: 768px)')

export function SendControls(props: {
  dictation: Dictation
  running: boolean
  empty: boolean
  blank: boolean
  delivery: PromptDelivery | null
  onSubmit: (swap: boolean) => void
  onStop: () => void
}) {
  const dictateButton = useStore((state) =>
    wide.matches
      ? state.prefs.dictateButton.desktop
      : state.prefs.dictateButton.mobile
  )
  const dictation = props.dictation.state
  const [previous, setPrevious] = useState(dictation)
  const [closing, setClosing] = useState<ActiveDictation | null>(null)
  if (previous !== dictation) {
    setPrevious(dictation)
    setClosing(
      dictation.kind === 'idle' && previous.kind !== 'idle' ? previous : null
    )
  }
  const pill = dictation.kind === 'idle' ? closing : dictation

  useEffect(() => {
    if (closing === null) {
      return
    }
    const timer = setTimeout(() => setClosing(null), 300)
    return () => clearTimeout(timer)
  }, [closing])

  const overlay = pill !== null && (
    <DictationPill
      state={pill}
      dictation={props.dictation}
      closing={dictation.kind === 'idle'}
    />
  )

  if (dictation.kind !== 'idle') {
    return (
      <>
        {overlay}
        <div className="size-9 shrink-0" />
      </>
    )
  }

  if (props.running && props.empty) {
    return (
      <>
        {overlay}
        <button
          className="bg-destructive/90 shadow-destructive/24 hover:bg-destructive flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-white shadow-xs transition-colors"
          title="Stop (Esc)"
          aria-label="Stop generation"
          onClick={props.onStop}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="currentColor"
            aria-hidden="true"
          >
            <rect x="2" y="2" width="8" height="8" rx="1.5" />
          </svg>
        </button>
      </>
    )
  }

  if (props.blank && dictateButton) {
    return (
      <>
        {overlay}
        <button
          className="bg-message-action text-message-action-foreground shadow-message-action/24 hover:bg-message-action-hover flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full shadow-xs transition-all duration-150 hover:scale-105"
          title={`Dictate (${mod}+Shift+D)`}
          aria-label="Dictate"
          onClick={() => void props.dictation.toggle()}
        >
          <HugeiconsIcon icon={AiMicIcon} className="size-4" />
        </button>
      </>
    )
  }

  return (
    <>
      {overlay}
      <button
        className="bg-message-action text-message-action-foreground shadow-message-action/24 hover:bg-message-action-hover disabled:bg-foreground/12 disabled:text-muted-foreground relative flex size-9 items-center justify-center overflow-hidden rounded-full shadow-xs transition-all duration-150 hover:scale-105 enabled:cursor-pointer disabled:pointer-events-none disabled:shadow-none"
        title={
          props.running && props.delivery === 'steer'
            ? `Send now (Enter) · Queue (${mod}+Enter)`
            : props.running
              ? `Queue (Enter) · Send now (${mod}+Enter)`
              : 'Send (Enter)'
        }
        aria-label="Send message"
        disabled={props.empty}
        onClick={(event) => props.onSubmit(event.metaKey || event.ctrlKey)}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M7 11.5V2.5M7 2.5L3 6.5M7 2.5L11 6.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </>
  )
}
