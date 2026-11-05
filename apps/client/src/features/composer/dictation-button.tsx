import { Loading03Icon, Mic01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect, useRef, useState } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { call } from '@/api/connection'
import { readBase64 } from '@/api/upload'
import { Button } from '@/components/ui/button'
import {
  draftKey,
  getState,
  showError,
  showSettingsPage,
  update,
} from '@/lib/store'
import { cn, mod } from '@/lib/utils'
import { editDraft } from './drafts'

const recordingTypes = ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/ogg']

export function DictationButton() {
  const [state, setState] = useState<'idle' | 'recording' | 'transcribing'>(
    'idle'
  )
  const recorder = useRef<MediaRecorder | null>(null)

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

  async function start() {
    const machine = dictationMachine()
    const dictation = getState().machines.find((item) => item.id === machine)
      ?.config?.dictation
    if (dictation === undefined) {
      throw new Error('This machine is not connected')
    }
    if (dictation.workflowId === null) {
      showSettingsPage('Dictation')
      update({ settingsMachine: machine })
      return
    }
    if (!(await call(machine, 'dictation.ping', undefined))) {
      throw new Error('OiPer is not running on this machine')
    }
    const mimeType = recordingTypes.find((type) =>
      MediaRecorder.isTypeSupported(type)
    )
    if (mimeType === undefined) {
      throw new Error(
        'This browser cannot record audio in a format OiPer reads'
      )
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const media = new MediaRecorder(stream, { mimeType })
    const chunks: Blob[] = []
    media.addEventListener('dataavailable', (event) => chunks.push(event.data))
    media.addEventListener('stop', async () => {
      for (const track of stream.getTracks()) {
        track.stop()
      }
      if (recorder.current !== media) {
        return
      }
      recorder.current = null
      setState('transcribing')
      try {
        const text = await call(dictationMachine(), 'dictation.transcribe', {
          audio: await readBase64(new Blob(chunks, { type: media.mimeType })),
          mediaType: media.mimeType,
        })
        if (text.trim() !== '') {
          insert(text.trim())
        }
      } catch (error) {
        showError(error)
      } finally {
        setState('idle')
      }
    })
    media.start()
    recorder.current = media
    setState('recording')
  }

  async function toggle() {
    if (state === 'transcribing') {
      return
    }
    if (state === 'recording') {
      recorder.current?.stop()
      return
    }
    try {
      await start()
    } catch (error) {
      showError(error)
    }
  }

  if (!window.isSecureContext) {
    return (
      <Button
        variant="ghost"
        size="icon-sm"
        title="Dictation needs https or localhost"
        aria-label="Dictate"
        disabled
      >
        <HugeiconsIcon icon={Mic01Icon} />
      </Button>
    )
  }

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      title={
        state === 'recording'
          ? `Stop and transcribe (${mod}+Shift+D)`
          : state === 'transcribing'
            ? 'Transcribing…'
            : `Dictate (${mod}+Shift+D)`
      }
      aria-label={state === 'recording' ? 'Stop dictation' : 'Dictate'}
      disabled={state === 'transcribing'}
      className={cn(
        state === 'recording' &&
          'text-destructive hover:text-destructive animate-pulse'
      )}
      onClick={() => void toggle()}
    >
      <HugeiconsIcon
        icon={state === 'transcribing' ? Loading03Icon : Mic01Icon}
        className={cn(state === 'transcribing' && 'animate-spin')}
      />
    </Button>
  )
}

function dictationMachine() {
  const state = getState()
  const selected = state.selection?.machine
  const machines = [
    ...state.machines.filter((machine) => machine.id === selected),
    ...state.machines.filter((machine) => machine.id !== selected),
  ]
  const found = machines.find((machine) => machine.status === 'online')
  if (found === undefined) {
    throw new Error('No machine is online for dictation')
  }
  return found.id
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
