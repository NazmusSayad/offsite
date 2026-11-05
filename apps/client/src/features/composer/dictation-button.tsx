import {
  Alert02Icon,
  Loading03Icon,
  Mic01Icon,
  RefreshIcon,
  StopIcon,
  XIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect, useRef, useState } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { call } from '@/api/connection'
import { readBase64 } from '@/api/upload'
import { Button } from '@/components/ui/button'
import { duration } from '@/lib/format'
import { logger } from '@/lib/log'
import { draftKey, getState, showSettingsPage, update } from '@/lib/store'
import { cn, errorMessage, mod } from '@/lib/utils'
import { toWav } from './dictation-audio'
import { editDraft } from './drafts'

const log = logger.withTag('dictation')
const meterBars = 40

type DictationState =
  | { kind: 'idle' }
  | { kind: 'recording'; started: number; analyser: AnalyserNode }
  | { kind: 'transcribing'; seconds: number }
  | {
      kind: 'failed'
      title: string
      detail: string | null
      action: 'retry' | 'restart' | null
    }

export type Dictation = ReturnType<typeof useDictation>

export function useDictation() {
  const [state, setState] = useState<DictationState>({ kind: 'idle' })
  const recorder = useRef<MediaRecorder | null>(null)
  const recording = useRef<{
    machine: string
    audio: string
    seconds: number
  } | null>(null)

  useEffect(
    () => () => {
      const media = recorder.current
      recorder.current = null
      if (media !== null) {
        media.stop()
      }
    },
    []
  )

  useHotkeys('mod+shift+d', () => void toggle(), {
    enableOnFormTags: true,
    preventDefault: true,
  })

  function fail(
    title: string,
    detail: string | null,
    action: 'retry' | 'restart' | null
  ) {
    log.warn(title, detail)
    setState({ kind: 'failed', title, detail, action })
  }

  async function start() {
    recording.current = null
    if (!window.isSecureContext) {
      fail(
        'Dictation needs a secure connection',
        'Open offsite over https or localhost to use the microphone',
        null
      )
      return
    }
    const machine = dictationMachine()
    if (machine === undefined) {
      fail(
        'No machine is online',
        'Dictation is transcribed by OiPer on a connected machine',
        'restart'
      )
      return
    }
    const dictation = machine.config?.dictation
    if (dictation === undefined) {
      fail(
        `${machine.name} hasn't loaded its settings yet`,
        'Wait a moment, then try again',
        'restart'
      )
      return
    }
    if (dictation.workflowId === null) {
      setState({ kind: 'idle' })
      showSettingsPage('Dictation')
      update({ settingsMachine: machine.id })
      return
    }
    if (!(await call(machine.id, 'dictation.ping', undefined))) {
      fail(
        `OiPer isn't running on ${machine.name}`,
        'Open the OiPer app on that machine, then try again',
        'restart'
      )
      return
    }
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        fail(
          'Microphone access is blocked',
          'Allow the microphone for this site in your browser settings, then try again',
          'restart'
        )
        return
      }
      if (error instanceof DOMException && error.name === 'NotFoundError') {
        fail(
          'No microphone found',
          'Connect a microphone, then try again',
          'restart'
        )
        return
      }
      if (error instanceof DOMException && error.name === 'NotReadableError') {
        fail(
          'The microphone is unavailable',
          'Another app may be using it, or the system blocked it',
          'restart'
        )
        return
      }
      fail("The microphone couldn't start", errorMessage(error), 'restart')
      return
    }
    const context = new AudioContext()
    const analyser = context.createAnalyser()
    analyser.fftSize = 1024
    context.createMediaStreamSource(stream).connect(analyser)
    const media = new MediaRecorder(stream)
    const chunks: Blob[] = []
    const started = Date.now()
    media.addEventListener('dataavailable', (event) => chunks.push(event.data))
    media.addEventListener('stop', async () => {
      for (const track of stream.getTracks()) {
        track.stop()
      }
      void context.close()
      if (recorder.current !== media) {
        return
      }
      recorder.current = null
      const seconds = (Date.now() - started) / 1000
      setState({ kind: 'transcribing', seconds })
      try {
        recording.current = {
          machine: machine.id,
          audio: await readBase64(
            await toWav(new Blob(chunks, { type: media.mimeType }))
          ),
          seconds,
        }
      } catch (error) {
        fail("The recording couldn't be read", errorMessage(error), 'restart')
        return
      }
      await transcribe()
    })
    media.start()
    recorder.current = media
    setState({ kind: 'recording', started, analyser })
  }

  async function transcribe() {
    const saved = recording.current
    if (saved === null) {
      throw new Error('No recording is saved to transcribe')
    }
    setState({ kind: 'transcribing', seconds: saved.seconds })
    let text: string
    try {
      text = await call(saved.machine, 'dictation.transcribe', {
        audio: saved.audio,
        mediaType: 'audio/wav',
      })
    } catch (error) {
      fail(
        "OiPer couldn't transcribe the recording",
        errorMessage(error),
        'retry'
      )
      return
    }
    if (text.trim() === '') {
      fail(
        'No speech was heard',
        'OiPer returned no text for this recording',
        'restart'
      )
      return
    }
    try {
      insert(text.trim())
    } catch (error) {
      fail("The transcript couldn't be added", errorMessage(error), 'retry')
      return
    }
    recording.current = null
    setState({ kind: 'idle' })
  }

  async function toggle() {
    if (state.kind === 'transcribing') {
      return
    }
    if (state.kind === 'recording') {
      recorder.current?.stop()
      return
    }
    try {
      await start()
    } catch (error) {
      fail("Dictation couldn't start", errorMessage(error), 'restart')
    }
  }

  function cancel() {
    const media = recorder.current
    recorder.current = null
    media?.stop()
    setState({ kind: 'idle' })
  }

  function dismiss() {
    recording.current = null
    setState({ kind: 'idle' })
  }

  return {
    state,
    toggle,
    cancel,
    dismiss,
    retry: () => void transcribe(),
  }
}

export function DictationButton(props: { dictation: Dictation }) {
  const state = props.dictation.state

  if (state.kind === 'recording') {
    return (
      <Button
        variant="destructive"
        size="icon-sm"
        title={`Stop and transcribe (${mod}+Shift+D)`}
        aria-label="Stop dictation"
        onClick={() => void props.dictation.toggle()}
      >
        <HugeiconsIcon icon={StopIcon} />
      </Button>
    )
  }

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      title={
        state.kind === 'transcribing'
          ? 'Transcribing…'
          : `Dictate (${mod}+Shift+D)`
      }
      aria-label="Dictate"
      disabled={state.kind === 'transcribing'}
      onClick={() => void props.dictation.toggle()}
    >
      <HugeiconsIcon
        icon={state.kind === 'transcribing' ? Loading03Icon : Mic01Icon}
        className={cn(state.kind === 'transcribing' && 'animate-spin')}
      />
    </Button>
  )
}

export function DictationStrip(props: { dictation: Dictation }) {
  const state = props.dictation.state

  if (state.kind === 'idle') {
    return null
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="composer-glass relative mx-auto -mb-[calc(1rem+1px)] flex w-[calc(100%-2.75rem)] items-center gap-2 rounded-t-2xl border border-b-0 border-(--composer-outline) ps-3 pe-1 pt-1 pb-[calc(1rem+1px+0.25rem)] text-xs/4"
    >
      {state.kind === 'recording' && (
        <Recording
          started={state.started}
          analyser={state.analyser}
          onCancel={props.dictation.cancel}
          onStop={() => void props.dictation.toggle()}
        />
      )}
      {state.kind === 'transcribing' && (
        <>
          <HugeiconsIcon
            icon={Loading03Icon}
            className="text-muted-foreground size-3.5 shrink-0 animate-spin"
          />
          <span className="text-secondary-label flex min-h-6 items-center truncate">
            Transcribing {duration(state.seconds)} of audio with OiPer…
          </span>
        </>
      )}
      {state.kind === 'failed' && (
        <>
          <HugeiconsIcon
            icon={Alert02Icon}
            className="text-destructive size-3.5 shrink-0"
          />
          <div className="min-w-0 flex-1 py-1">
            <div className="text-foreground font-medium">{state.title}</div>
            {state.detail !== null && (
              <div className="text-muted-foreground line-clamp-3 break-words select-text">
                {state.detail}
              </div>
            )}
          </div>
          {state.action === 'retry' && (
            <Button
              variant="ghost"
              size="xs"
              className="h-6"
              title="Send the same recording again"
              onClick={props.dictation.retry}
            >
              <HugeiconsIcon icon={RefreshIcon} />
              Retry
            </Button>
          )}
          {state.action === 'restart' && (
            <Button
              variant="ghost"
              size="xs"
              className="h-6"
              onClick={() => void props.dictation.toggle()}
            >
              Try again
            </Button>
          )}
          <Button
            variant="ghost-muted"
            size="icon-micro"
            title="Dismiss"
            aria-label="Dismiss"
            onClick={props.dictation.dismiss}
          >
            <HugeiconsIcon icon={XIcon} className="size-4" />
          </Button>
        </>
      )}
    </div>
  )
}

function Recording(props: {
  started: number
  analyser: AnalyserNode
  onCancel: () => void
  onStop: () => void
}) {
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
      history = [...history, level].slice(-meterBars)
      setLevels(history)
      setNow(Date.now())
    }
    return () => cancelAnimationFrame(frame)
  }, [props.analyser])

  const quiet =
    now - props.started > 3000 &&
    levels.length === meterBars &&
    levels.every((level) => level < 0.08)

  return (
    <>
      <span className="bg-destructive size-2 shrink-0 rounded-full motion-safe:animate-pulse" />
      <span className="text-foreground font-medium">Recording</span>
      <span className="text-muted-foreground tabular-nums">
        {duration((now - props.started) / 1000)}
      </span>
      {quiet ? (
        <span className="text-warning-foreground min-w-0 flex-1 truncate text-end">
          No sound from the microphone. Check that it is not muted
        </span>
      ) : (
        <div
          aria-hidden="true"
          className="flex h-4 min-w-0 flex-1 items-center justify-end gap-0.5 overflow-hidden"
        >
          {[...Array<number>(meterBars - levels.length).fill(0), ...levels].map(
            (level, index) => (
              <span
                key={index}
                className="bg-foreground/50 w-0.5 shrink-0 rounded-full"
                style={{ height: `${Math.max(12, level * 100)}%` }}
              />
            )
          )}
        </div>
      )}
      <Button
        variant="ghost-muted"
        size="xs"
        className="h-6"
        onClick={props.onCancel}
      >
        Cancel
      </Button>
      <Button
        variant="ghost"
        size="xs"
        className="h-6"
        title={`Stop and transcribe (${mod}+Shift+D)`}
        onClick={props.onStop}
      >
        Done
      </Button>
    </>
  )
}

function dictationMachine() {
  const state = getState()
  const selected = state.selection?.machine
  return [
    ...state.machines.filter((machine) => machine.id === selected),
    ...state.machines.filter((machine) => machine.id !== selected),
  ].find((machine) => machine.status === 'online')
}

function insert(value: string) {
  const selection = getState().selection
  if (selection === null) {
    throw new Error('No thread is open to dictate into')
  }
  const input = document.querySelector<HTMLTextAreaElement>('[data-composer]')
  if (input === null) {
    throw new Error('The composer is not mounted')
  }
  const at = input.selectionStart
  const before = /(^|\s)$/.test(input.value.slice(0, at)) ? '' : ' '
  const after = /^\s/.test(input.value.slice(at)) ? '' : ' '
  const inserted = `${before}${value}${after}`
  const position = at + inserted.length
  editDraft(draftKey(selection), (current) => ({
    ...current,
    text: `${current.text.slice(0, at)}${inserted}${current.text.slice(at)}`,
  }))
  requestAnimationFrame(() => {
    input.focus()
    input.setSelectionRange(position, position)
  })
}
