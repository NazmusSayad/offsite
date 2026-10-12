import type { Progress } from './ghostty/terminal'
import { showNotification } from './notifications'
import { getState, setState, tabTitle } from './session'

const statusNames = ['waiting', 'error', 'done', 'working'] as const
export type Status = (typeof statusNames)[number]
const attentionOrder = [
  'waiting',
  'error',
  'alert',
  'done',
  'unread',
  'working',
] as const
export type Attention = (typeof attentionOrder)[number]

const notifiedAt = new Map<number, number>()
const pendingBells = new Map<number, number>()
const inputAt = new Map<number, number>()
const quietTimers = new Map<number, number>()
let audio: AudioContext | null = null
let beepedAt = 0
let appBadge: number | null = null

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
      if (!isSeen(id)) notify(id, '', 'Bell')
    }, 500)
  )
}

export function notifyFromProgram(id: number, title: string, body: string) {
  if (!raiseAlert(id)) return
  window.clearTimeout(pendingBells.get(id))
  pendingBells.delete(id)
  notify(id, title, body)
}

function notify(id: number, title: string, body: string) {
  notifiedAt.set(id, performance.now())
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
  return (
    attentionOrder.find((kind) =>
      ids.some((id) => {
        if (kind === 'alert') return state.alerts.includes(id)
        if (kind === 'unread') return state.unread.includes(id)
        return state.statuses[id] === kind
      })
    ) ?? null
  )
}

export function unseenAttention(alive: (id: number) => boolean) {
  const state = getState()
  return {
    alerts: state.alerts.filter((id) => alive(id) && !isSeen(id)),
    unread: state.config.behavior.activityMarks
      ? state.unread.filter((id) => alive(id) && !isSeen(id))
      : [],
    statuses: state.config.behavior.agentStatus
      ? Object.fromEntries(
          Object.entries(state.statuses).filter(
            (entry) =>
              alive(Number(entry[0])) &&
              !(entry[1] === 'done' && isSeen(Number(entry[0])))
          )
        )
      : {},
    quiet: state.quiet.filter((id) => alive(id)),
  }
}

export function attentionCount() {
  const state = getState()
  return state.config.behavior.activityMarks
    ? new Set([...state.alerts, ...state.unread]).size
    : 0
}

export function updateAppBadge(count: number) {
  if (!('setAppBadge' in navigator) || count === appBadge) return
  appBadge = count
  navigator
    .setAppBadge(count)
    .catch((error: unknown) =>
      console.warn('could not set the app badge', error)
    )
}

export function toggleQuiet(id: number) {
  const state = getState()
  if (!state.quiet.includes(id)) {
    setState({ quiet: [...state.quiet, id] })
    return
  }
  window.clearTimeout(quietTimers.get(id))
  quietTimers.delete(id)
  setState({ quiet: state.quiet.filter((item) => item !== id) })
}

export function noteInput(id: number) {
  inputAt.set(id, performance.now())
}

export function noteOutput(id: number) {
  const state = getState()
  if (state.quiet.includes(id)) {
    window.clearTimeout(quietTimers.get(id))
    quietTimers.set(
      id,
      window.setTimeout(() => {
        quietTimers.delete(id)
        if (raiseAlert(id)) notify(id, '', 'No output for 10 seconds')
      }, 10_000)
    )
  }
  const input = inputAt.get(id)
  if (input !== undefined && performance.now() - input < 1000) return
  if (
    state.config.behavior.activityMarks &&
    !state.unread.includes(id) &&
    !isSeen(id)
  )
    setState({ unread: [...state.unread, id] })
}

export function noteStatus(id: number, text: string, replay: boolean) {
  const value = text.trim().toLowerCase()
  const status =
    value === 'idle' ? 'done' : statusNames.find((name) => name === value)
  if (value === '') setStatus(id, null, replay)
  else if (status !== undefined) setStatus(id, status, replay)
}

export function noteProgress(id: number, progress: Progress, replay: boolean) {
  const current = getState().statuses[id]
  if (progress.state === 1 || progress.state === 3)
    setStatus(id, 'working', replay)
  else if (progress.state === 2) setStatus(id, 'error', replay)
  else if (progress.state === 4) setStatus(id, 'waiting', replay)
  else if (progress.state !== 0)
    throw new Error(`unknown progress state ${progress.state}`)
  else if (current === undefined || current === 'error')
    setStatus(id, null, replay)
  else setStatus(id, 'done', replay)
}

function setStatus(id: number, status: Status | null, replay: boolean) {
  const state = getState()
  if (!state.config.behavior.agentStatus) return
  const next = replay && status === 'done' ? null : status
  if ((state.statuses[id] ?? null) === next) return
  const statuses = { ...state.statuses }
  if (next === null) delete statuses[id]
  else statuses[id] = next
  setState({ statuses })
  if (!replay && next !== null && next !== 'working') raiseAlert(id)
}

export function forgetTab(id: number) {
  window.clearTimeout(pendingBells.get(id))
  pendingBells.delete(id)
  notifiedAt.delete(id)
  window.clearTimeout(quietTimers.get(id))
  quietTimers.delete(id)
  inputAt.delete(id)
}
