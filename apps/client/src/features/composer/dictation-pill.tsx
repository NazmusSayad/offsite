import {
  Alert02Icon,
  Loading03Icon,
  RefreshIcon,
  Tick02Icon,
  XIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import type { ActiveDictation, Dictation } from './dictation'

const meterBars = 9
const quietSamples = 40

export function DictationPill(props: {
  state: ActiveDictation
  dictation: Dictation
  closing: boolean
}) {
  const state = props.state

  return (
    <div
      role="status"
      aria-live="polite"
      aria-hidden={props.closing}
      aria-label={
        state.kind === 'recording'
          ? 'Recording'
          : state.kind === 'transcribing'
            ? 'Transcribing'
            : state.title
      }
      className={cn(
        'absolute inset-y-0 right-0 left-0 z-10 flex md:-inset-y-px items-center gap-0.5 rounded-full ps-1 shadow-xs motion-safe:starting:[clip-path:inset(0_0_0_calc(100%-2.375rem)_round_9999px)]',
        props.closing
          ? 'pointer-events-none [clip-path:inset(0_0_0_calc(100%-2.375rem)_round_9999px)] opacity-0 [transition:clip-path_250ms_cubic-bezier(0.4,0,0.2,1),opacity_120ms_linear_150ms]'
          : '[clip-path:inset(0_0_0_0_round_9999px)] transition-[clip-path,background-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
        state.kind === 'failed' && state.action === null && 'max-md:pe-7',
        state.kind === 'failed'
          ? 'bg-[color-mix(in_srgb,var(--composer-surface)_86%,var(--destructive))]'
          : 'bg-[color-mix(in_srgb,var(--composer-surface)_90%,var(--text))]'
      )}
    >
      <button
        className="text-muted-foreground hover:bg-foreground/10 hover:text-foreground flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full transition-[opacity,background-color,color] delay-100 duration-200 motion-safe:starting:opacity-0"
        title={
          state.kind === 'recording'
            ? 'Cancel'
            : state.kind === 'transcribing'
              ? 'Cancel transcription'
              : 'Dismiss (Esc)'
        }
        aria-label={
          state.kind === 'recording'
            ? 'Cancel dictation'
            : state.kind === 'transcribing'
              ? 'Cancel transcription'
              : 'Dismiss'
        }
        onClick={props.dictation.cancel}
      >
        <HugeiconsIcon icon={XIcon} className="size-3.5 md:size-4" />
      </button>
      {state.kind === 'recording' && (
        <Meter started={state.started} analyser={state.analyser} />
      )}
      {state.kind === 'transcribing' && (
        <div
          aria-hidden="true"
          className="flex h-4 min-w-0 flex-1 items-center justify-center gap-0.5"
        >
          {Array.from({ length: meterBars }, (_, index) => (
            <span
              key={index}
              className="bg-foreground/50 h-[35%] w-0.5 shrink-0 rounded-full motion-safe:animate-pulse"
              style={{ animationDelay: `${index * 110}ms` }}
            />
          ))}
        </div>
      )}
      {state.kind === 'failed' && (
        <span
          className="text-destructive line-clamp-2 min-w-0 flex-1 cursor-default text-center text-[11px]/[1.15] font-medium transition-opacity duration-200 motion-safe:starting:opacity-0"
          title={`${state.title}${state.detail === null ? '' : `\n${state.detail}`}`}
        >
          {state.label}
        </span>
      )}
      {state.kind === 'recording' && (
        <button
          className="bg-message-action text-message-action-foreground shadow-message-action/24 hover:bg-message-action-hover flex size-9.5 shrink-0 cursor-pointer items-center justify-center rounded-full shadow-xs transition-colors"
          title="Done, transcribe (Esc)"
          aria-label="Finish dictation"
          onClick={() => void props.dictation.toggle()}
        >
          <HugeiconsIcon icon={Tick02Icon} className="size-4" strokeWidth={2} />
        </button>
      )}
      {state.kind === 'transcribing' && (
        <span className="bg-foreground/12 text-muted-foreground flex size-9.5 shrink-0 items-center justify-center rounded-full">
          <HugeiconsIcon icon={Loading03Icon} className="size-4 animate-spin" />
        </span>
      )}
      {state.kind === 'failed' && state.action !== null && (
        <button
          className="bg-message-action text-message-action-foreground shadow-message-action/24 hover:bg-message-action-hover flex size-9.5 shrink-0 cursor-pointer items-center justify-center rounded-full shadow-xs transition-colors"
          title={
            state.action === 'retry'
              ? 'Retry with the same recording'
              : 'Try again'
          }
          aria-label={state.action === 'retry' ? 'Retry' : 'Try again'}
          onClick={
            state.action === 'retry'
              ? props.dictation.retry
              : () => void props.dictation.toggle()
          }
        >
          <HugeiconsIcon icon={RefreshIcon} className="size-4" />
        </button>
      )}
    </div>
  )
}

function Meter(props: { started: number; analyser: AnalyserNode }) {
  const [levels, setLevels] = useState<number[]>([])
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const samples = new Float32Array(props.analyser.fftSize)
    let history: number[] = []
    let last = 0
    let frame = requestAnimationFrame(tick)
    function tick(time: number) {
      frame = requestAnimationFrame(tick)
      if (time - last < 60) {
        return
      }
      last = time
      props.analyser.getFloatTimeDomainData(samples)
      let sum = 0
      for (const sample of samples) {
        sum += sample * sample
      }
      const level = Math.min(
        1,
        Math.sqrt(Math.sqrt(sum / samples.length)) * 1.6
      )
      history = [...history, level].slice(-quietSamples)
      setLevels(history)
      setNow(Date.now())
    }
    return () => cancelAnimationFrame(frame)
  }, [props.analyser])

  const quiet =
    now - props.started > 3000 &&
    levels.length === quietSamples &&
    levels.every((level) => level < 0.08)
  const shown = levels.slice(-meterBars)

  return (
    <div className="flex h-4 min-w-0 flex-1 items-center justify-center gap-0.5 transition-opacity delay-100 duration-200 motion-safe:starting:opacity-0">
      {quiet ? (
        <span title="No sound from the microphone. Check that it is not muted">
          <HugeiconsIcon
            icon={Alert02Icon}
            className="text-warning-foreground size-3.5"
          />
        </span>
      ) : (
        [...Array<number>(meterBars - shown.length).fill(0), ...shown].map(
          (level, index) => (
            <span
              key={index}
              aria-hidden="true"
              className="bg-destructive/80 w-0.5 shrink-0 rounded-full"
              style={{ height: `${Math.max(15, level * 100)}%` }}
            />
          )
        )
      )}
    </div>
  )
}
