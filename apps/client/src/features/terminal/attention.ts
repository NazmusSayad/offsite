import { currentView, getState, setState } from './session'

let audio: AudioContext | null = null
let beepedAt = 0

export function isSeen(id: number) {
  return (
    getState().open &&
    currentView()?.tabId === id &&
    !document.hidden &&
    document.hasFocus()
  )
}

export function raiseAlert(id: number) {
  if (isSeen(id)) {
    return
  }
  const state = getState()
  if (!state.alerts.includes(id)) {
    setState({ alerts: [...state.alerts, id] })
  }
}

export function beep() {
  const now = performance.now()
  if (now - beepedAt < 150) {
    return
  }
  beepedAt = now
  audio ??= new AudioContext()
  if (audio.state === 'suspended') {
    void audio.resume()
  }
  const oscillator = audio.createOscillator()
  const gain = audio.createGain()
  const start = audio.currentTime
  oscillator.frequency.value = 880
  gain.gain.setValueAtTime(0.1, start)
  gain.gain.exponentialRampToValueAtTime(0.001, start + 0.15)
  oscillator.connect(gain).connect(audio.destination)
  oscillator.start(start)
  oscillator.stop(start + 0.15)
}

export function unseenAttention(alive: (id: number) => boolean) {
  return {
    alerts: getState().alerts.filter((id) => alive(id) && !isSeen(id)),
  }
}
