import { useEffect, useRef, useState } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { call } from '@/api/connection'
import { readBase64 } from '@/api/upload'
import { logger } from '@/lib/log'
import {
  draftKey,
  getState,
  showSettingsPage,
  update,
  useStore,
} from '@/lib/store'
import { errorMessage } from '@/lib/utils'
import { toWav } from './dictation-audio'
import { editDraft } from './drafts'

const log = logger.withTag('dictation')

export type ActiveDictation = Exclude<DictationState, { kind: 'idle' }>

type DictationState =
  | { kind: 'idle' }
  | { kind: 'recording'; started: number; analyser: AnalyserNode }
  | { kind: 'transcribing' }
  | {
      kind: 'failed'
      label: string
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
    key: string
    audio: string
  } | null>(null)
  const attempt = useRef(0)

  const selection = useStore((store) => store.selection)
  const escapable = state.kind === 'recording' || state.kind === 'failed'

  useEffect(
    () => () => {
      const media = recorder.current
      recorder.current = null
      media?.stop()
      setState((current) =>
        current.kind === 'transcribing' ? current : { kind: 'idle' }
      )
    },
    [selection?.machine, selection?.projectId, selection?.sessionId]
  )

  useEffect(() => {
    if (!escapable) {
      return
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.isComposing) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      const media = recorder.current
      if (media !== null) {
        media.stop()
        return
      }
      recording.current = null
      setState({ kind: 'idle' })
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [escapable])

  useHotkeys('mod+shift+d', () => void toggle(), {
    enableOnFormTags: true,
    preventDefault: true,
  })

  function fail(
    label: string,
    title: string,
    detail: string | null,
    action: 'retry' | 'restart' | null
  ) {
    log.warn(title, detail)
    setState({ kind: 'failed', label, title, detail, action })
  }

  async function start() {
    recording.current = null
    if (!window.isSecureContext) {
      fail(
        'Needs https',
        'Dictation needs a secure connection',
        'Open offsite over https or localhost to use the microphone',
        null
      )
      return
    }
    const thread = getState().selection
    if (thread === null) {
      fail(
        'No thread',
        'No thread is open',
        'Open a thread to dictate into it',
        null
      )
      return
    }
    const key = draftKey(thread)
    const machine = dictationMachine()
    if (machine === undefined) {
      fail(
        'No machine',
        'No machine is online',
        'Dictation is transcribed by OiPer on a connected machine',
        'restart'
      )
      return
    }
    const dictation = machine.config?.dictation
    if (dictation === undefined) {
      fail(
        'Not ready',
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
        'OiPer is off',
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
          'Mic blocked',
          'Microphone access is blocked',
          'Allow the microphone for this site in your browser settings, then try again',
          'restart'
        )
        return
      }
      if (error instanceof DOMException && error.name === 'NotFoundError') {
        fail(
          'No mic',
          'No microphone found',
          'Connect a microphone, then try again',
          'restart'
        )
        return
      }
      if (error instanceof DOMException && error.name === 'NotReadableError') {
        fail(
          'Mic busy',
          'The microphone is unavailable',
          'Another app may be using it, or the system blocked it',
          'restart'
        )
        return
      }
      fail(
        'Mic failed',
        "The microphone couldn't start",
        errorMessage(error),
        'restart'
      )
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
      const current = attempt.current
      setState({ kind: 'transcribing' })
      let audio: string
      try {
        audio = await readBase64(
          await toWav(new Blob(chunks, { type: media.mimeType }))
        )
      } catch (error) {
        if (attempt.current === current) {
          fail(
            'Bad audio',
            "The recording couldn't be read",
            errorMessage(error),
            'restart'
          )
        }
        return
      }
      if (attempt.current !== current) {
        return
      }
      recording.current = { machine: machine.id, key, audio }
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
    const current = attempt.current
    setState({ kind: 'transcribing' })
    let text: string
    try {
      text = await call(saved.machine, 'dictation.transcribe', {
        audio: saved.audio,
        mediaType: 'audio/wav',
      })
    } catch (error) {
      if (attempt.current === current) {
        fail(
          'Failed',
          "OiPer couldn't transcribe the recording",
          errorMessage(error),
          'retry'
        )
      }
      return
    }
    if (attempt.current !== current) {
      return
    }
    if (text.trim() === '') {
      fail(
        'No speech',
        'No speech was heard',
        'OiPer returned no text for this recording',
        'restart'
      )
      return
    }
    try {
      insert(text.trim(), saved.key)
    } catch (error) {
      fail(
        'Not added',
        "The transcript couldn't be added",
        errorMessage(error),
        'retry'
      )
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
      fail('Failed', "Dictation couldn't start", errorMessage(error), 'restart')
    }
  }

  function cancel() {
    attempt.current += 1
    const media = recorder.current
    recorder.current = null
    media?.stop()
    recording.current = null
    setState({ kind: 'idle' })
  }

  return {
    state,
    toggle,
    cancel,
    retry: () => void transcribe(),
  }
}

function dictationMachine() {
  const state = getState()
  const selected = state.selection?.machine
  return [
    ...state.machines.filter((machine) => machine.id === selected),
    ...state.machines.filter((machine) => machine.id !== selected),
  ].find((machine) => machine.status === 'online')
}

function insert(value: string, key: string) {
  const selection = getState().selection
  if (selection === null || draftKey(selection) !== key) {
    editDraft(key, (current) => ({
      ...current,
      text: `${current.text}${/(^|\s)$/.test(current.text) ? '' : ' '}${value} `,
    }))
    return
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
  editDraft(key, (current) => ({
    ...current,
    text: `${current.text.slice(0, at)}${inserted}${current.text.slice(at)}`,
  }))
  requestAnimationFrame(() => {
    input.focus()
    input.setSelectionRange(position, position)
  })
}
