import { showNotification } from './notifications'
import { checkConnection, getState, setState, tabTitle } from './session'

const notifiedAt = new Map<number, number>()
const pendingBells = new Map<number, number>()
const inputAt = new Map<number, number>()
const quietTimers = new Map<number, number>()
const quietDue = new Set<number>()
let audio: AudioContext | null = null
let beepedAt = 0
let appBadge: number | null = null
let live = false

export function isSeen(id: number) {
  const state = getState()
  const group = state.layout.groups.find(
    (item) => item.id === state.layout.activeGroup
  )
  return group?.activeTab === id && !document.hidden && document.hasFocus()
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
  const group = getState().layout.groups.find((item) =>
    item.tabs.some((tab) => tab.id === id)
  )
  const tab = group?.tabs.find((item) => item.id === id)
  if (!group || !tab) return
  showNotification(title || tabTitle(tab), body, {
    groupId: group.id,
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

export function attention(ids: number[]) {
  const state = getState()
  if (ids.some((id) => state.alerts.includes(id))) return 'alert'
  if (ids.some((id) => state.unread.includes(id))) return 'unread'
  return null
}

export function unseenAttention(alive: (id: number) => boolean) {
  const state = getState()
  return {
    alerts: state.alerts.filter((id) => alive(id) && !isSeen(id)),
    unread: state.config.behavior.activityMarks
      ? state.unread.filter((id) => alive(id) && !isSeen(id))
      : [],
    quiet: state.config.behavior.activityMarks
      ? state.quiet.filter((id) => alive(id))
      : [],
  }
}

export function attentionCount() {
  const state = getState()
  if (state.status !== 'active') return 0
  return state.config.behavior.activityMarks
    ? state.unread.filter((id) => !state.alerts.includes(id)).length
    : 0
}

export function updateAppBadge(count: number) {
  if (!('setAppBadge' in navigator)) return
  const state = getState()
  if (state.status !== 'active') {
    appBadge = null
    return
  }
  if (count === appBadge) return
  if (appBadge === null && !state.config.behavior.activityMarks) return
  appBadge = count
  navigator
    .setAppBadge(count)
    .catch((error: unknown) =>
      console.warn('could not set the app badge', error)
    )
}

export function syncQuietTimers() {
  const state = getState()
  if (!state.config.behavior.activityMarks) {
    for (const timer of quietTimers.values()) window.clearTimeout(timer)
    quietTimers.clear()
    quietDue.clear()
  }
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
      checkConnection()
    }, 10_000)
  )
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

export function noteInput(id: number) {
  inputAt.set(id, performance.now())
}

export function noteOutput(id: number, bytes: Uint8Array) {
  const state = getState()
  if (state.quiet.includes(id)) startQuietTimer(id)
  const input = inputAt.get(id)
  if (input !== undefined && performance.now() - input < 1000) return
  if (
    state.config.behavior.activityMarks &&
    !state.unread.includes(id) &&
    !isSeen(id) &&
    isVisible(bytes)
  )
    setState({ unread: [...state.unread, id] })
}

function isVisible(bytes: Uint8Array) {
  let mode = 'text'
  for (const byte of bytes) {
    if (mode === 'text' && byte === 0x1b) mode = 'escape'
    else if (
      mode === 'text' &&
      (byte === 0x0a || (byte >= 0x20 && byte !== 0x7f))
    )
      return true
    else if (mode === 'escape' && byte === 0x5b) mode = 'csi'
    else if (mode === 'escape' && byte === 0x5d) mode = 'osc'
    else if (mode === 'escape' && (byte < 0x20 || byte > 0x2f)) mode = 'text'
    else if (mode === 'csi' && byte >= 0x40 && byte <= 0x7e) mode = 'text'
    else if (mode === 'osc' && byte === 0x07) mode = 'text'
    else if (mode === 'osc' && byte === 0x1b) mode = 'escape'
  }
  return false
}

export function forgetTab(id: number) {
  window.clearTimeout(pendingBells.get(id))
  pendingBells.delete(id)
  notifiedAt.delete(id)
  window.clearTimeout(quietTimers.get(id))
  quietTimers.delete(id)
  quietDue.delete(id)
  inputAt.delete(id)
}
