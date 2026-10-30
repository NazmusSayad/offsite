import { GLOBAL_TERMINALS } from '@offsite/core/terminal'
import { showNotification } from '@/lib/notifications'
import {
  currentView,
  findTab,
  getState,
  setState,
  tabTitle,
  terminalMachine,
} from './session'

const notifiedAt = new Map<number, number>()
const pendingBells = new Map<number, number>()
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

function raiseAlert(id: number) {
  if (isSeen(id)) {
    return false
  }
  const state = getState()
  if (!state.alerts.includes(id)) {
    setState({ alerts: [...state.alerts, id] })
  }
  return true
}

export function ringBell(id: number) {
  if (!raiseAlert(id) || pendingBells.has(id)) {
    return
  }
  const last = notifiedAt.get(id)
  if (last !== undefined && performance.now() - last < 5000) {
    return
  }
  pendingBells.set(
    id,
    window.setTimeout(() => {
      pendingBells.delete(id)
      if (isSeen(id)) {
        return
      }
      notifiedAt.set(id, performance.now())
      notify(id, '', 'Bell')
    }, 500)
  )
}

export function notifyFromProgram(id: number, title: string, body: string) {
  if (!raiseAlert(id)) {
    return
  }
  window.clearTimeout(pendingBells.get(id))
  pendingBells.delete(id)
  notifiedAt.set(id, performance.now())
  notify(id, title, body)
}

function notify(id: number, title: string, body: string) {
  const tab = findTab(id)
  if (!tab) {
    return
  }
  showNotification(title || tabTitle(tab), body, {
    machine: terminalMachine(),
    project: tab.projectId ?? GLOBAL_TERMINALS,
    tabId: id,
  }).catch((error: unknown) =>
    console.error('could not show a notification', error)
  )
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

export function forgetTab(id: number) {
  window.clearTimeout(pendingBells.get(id))
  pendingBells.delete(id)
  notifiedAt.delete(id)
}
