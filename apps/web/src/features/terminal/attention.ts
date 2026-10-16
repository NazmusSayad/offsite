import { checkConnection } from '@/api/connection'
import { showNotification } from '@/lib/notifications'
import {
  currentProject,
  findProject,
  getState,
  setState,
  tabTitle,
  terminalMachine,
} from './session'

const notifiedAt = new Map<number, number>()
const pendingBells = new Map<number, number>()
const quietTimers = new Map<number, number>()
const quietDue = new Set<number>()
let audio: AudioContext | null = null
let beepedAt = 0
let live = false

export function isSeen(id: number) {
  return (
    getState().open &&
    currentProject()?.project?.activeTab === id &&
    !document.hidden &&
    document.hasFocus()
  )
}

function raiseAlert(id: number) {
  if (isSeen(id)) return false
  const state = getState()
  if (!state.alerts.includes(id)) setState({ alerts: [...state.alerts, id] })
  return true
}

export function ringBell(id: number) {
  if (!raiseAlert(id) || pendingBells.has(id)) return
  const last = notifiedAt.get(id)
  if (last !== undefined && performance.now() - last < 5000) return
  pendingBells.set(
    id,
    window.setTimeout(() => {
      pendingBells.delete(id)
      if (isSeen(id)) return
      notifiedAt.set(id, performance.now())
      notify(id, '', 'Bell')
    }, 500)
  )
}

export function notifyFromProgram(id: number, title: string, body: string) {
  if (!raiseAlert(id)) return
  window.clearTimeout(pendingBells.get(id))
  pendingBells.delete(id)
  notifiedAt.set(id, performance.now())
  notify(id, title, body)
}

function notify(id: number, title: string, body: string) {
  const found = findProject(id)
  const tab = found?.project.tabs.find((item) => item.id === id)
  if (!found || !tab) return
  showNotification(title || tabTitle(tab), body, {
    machine: terminalMachine(),
    cwd: found.cwd,
    tabId: id,
  }).catch((error: unknown) =>
    console.error('could not show a notification', error)
  )
}

export function beep() {
  const now = performance.now()
  if (now - beepedAt < 150) return
  beepedAt = now
  audio ??= new AudioContext()
  if (audio.state === 'suspended') void audio.resume()
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
  const state = getState()
  return {
    alerts: state.alerts.filter((id) => alive(id) && !isSeen(id)),
    quiet: state.quiet.filter((id) => alive(id)),
  }
}

export function syncQuietTimers() {
  const state = getState()
  const active = state.status === 'active'
  if (active && !live) for (const id of quietTimers.keys()) startQuietTimer(id)
  live = active
}

function startQuietTimer(id: number) {
  window.clearTimeout(quietTimers.get(id))
  quietDue.delete(id)
  const armedAt = Date.now()
  quietTimers.set(
    id,
    window.setTimeout(() => {
      if (getState().status !== 'active') return
      if (Date.now() - armedAt > 15_000) {
        startQuietTimer(id)
        return
      }
      quietDue.add(id)
      void confirmQuiet()
    }, 10_000)
  )
}

async function confirmQuiet() {
  if (await checkConnection(terminalMachine())) noteMessage()
}

function notifyQuiet(id: number) {
  quietTimers.delete(id)
  quietDue.delete(id)
  if (raiseAlert(id)) notify(id, '', 'No output for 10 seconds')
}

export function noteMessage() {
  if (getState().status !== 'active') return
  for (const id of quietDue) notifyQuiet(id)
}

export function toggleQuiet(id: number) {
  const state = getState()
  if (!state.quiet.includes(id)) {
    setState({ quiet: [...state.quiet, id] })
    return
  }
  window.clearTimeout(quietTimers.get(id))
  quietTimers.delete(id)
  quietDue.delete(id)
  setState({ quiet: state.quiet.filter((item) => item !== id) })
}

export function noteOutput(id: number) {
  if (getState().quiet.includes(id)) startQuietTimer(id)
}

export function forgetTab(id: number) {
  window.clearTimeout(pendingBells.get(id))
  pendingBells.delete(id)
  notifiedAt.delete(id)
  window.clearTimeout(quietTimers.get(id))
  quietTimers.delete(id)
  quietDue.delete(id)
}
