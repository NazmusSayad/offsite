import { call, isConnected } from './connection'
import { getState, selectedRunning } from './store'

const started = performance.now()
const tab = `${navigator.userAgent.includes('Mac') ? 'mac' : 'other'}-${Math.random().toString(36).slice(2, 6)}`
const pending: string[] = []
const preventers = new WeakMap<Event, string>()
let textarea: HTMLTextAreaElement | null = null
let mounts = 0
let lastKey = -Infinity
let pasteSeen = true

function composer() {
  return document.querySelector<HTMLTextAreaElement>('[data-composer]')
}

function stack() {
  return (new Error().stack ?? '')
    .split('\n')
    .slice(2, 9)
    .map((frame) => frame.trim().replace(/https?:\/\/[^/]+/, ''))
    .join(' < ')
}

function describe(target: EventTarget | null) {
  if (target === null) return 'null'
  if (!(target instanceof Element)) return String(target)
  if (target === textarea) return `textarea#composer${mounts}`
  const label =
    target.getAttribute('data-slot') ??
    target.getAttribute('aria-label') ??
    target.getAttribute('placeholder') ??
    target.getAttribute('class') ??
    ''
  return `${target.tagName.toLowerCase()}(${label.slice(0, 40)})`
}

function report(text: string) {
  pending.push(`${tab} ${Math.round(performance.now() - started)}ms ${text}`)
  if (!isConnected()) return
  for (const line of pending.splice(0))
    call('debug', { line }).catch((error: unknown) =>
      console.warn('paste-debug could not report', error)
    )
}

function running() {
  try {
    return String(selectedRunning(getState()))
  } catch {
    return 'unknown'
  }
}

function isPasteKey(event: Event) {
  return (
    event instanceof KeyboardEvent &&
    event.type === 'keydown' &&
    (event.metaKey || event.ctrlKey) &&
    event.key.toLowerCase() === 'v'
  )
}

function tracked(event: Event) {
  if (event.type === 'paste' || isPasteKey(event)) return true
  if (event.type !== 'beforeinput' && event.type !== 'input') return false
  if (!(event instanceof InputEvent)) return false
  return event.inputType.includes('Paste') || performance.now() - lastKey < 2000
}

const preventDefault = Event.prototype.preventDefault
Event.prototype.preventDefault = function (this: Event) {
  if (tracked(this)) preventers.set(this, stack())
  preventDefault.call(this)
}

const focus = HTMLElement.prototype.focus
HTMLElement.prototype.focus = function (
  this: HTMLElement,
  options?: FocusOptions
) {
  const active = document.activeElement
  if (active !== null && active === textarea && this !== textarea)
    report(`FOCUS STOLEN from composer to ${describe(this)} by ${stack()}`)
  focus.call(this, options)
}

const blur = HTMLElement.prototype.blur
HTMLElement.prototype.blur = function (this: HTMLElement) {
  if (this === textarea) report(`COMPOSER BLUR() by ${stack()}`)
  blur.call(this)
}

function watch(event: Event) {
  if (!tracked(event)) return
  if (isPasteKey(event)) {
    lastKey = performance.now()
    pasteSeen = false
    const key = lastKey
    setTimeout(() => {
      if (!pasteSeen && key === lastKey)
        report(
          `NO PASTE EVENT 500ms after keydown, active=${describe(document.activeElement)} hasFocus=${document.hasFocus()}`
        )
    }, 500)
  }
  if (event.type === 'paste') pasteSeen = true
  const before = composer()?.value.length ?? -1
  const parts = [
    event.type,
    `active=${describe(document.activeElement)}`,
    `target=${describe(event.target)}`,
    `running=${running()}`,
    `hasFocus=${document.hasFocus()}`,
    `len=${before}`,
  ]
  if (event instanceof KeyboardEvent)
    parts.push(
      `key=${event.key} code=${event.code} meta=${event.metaKey} ctrl=${event.ctrlKey} repeat=${event.repeat} composing=${event.isComposing}`
    )
  if (event instanceof InputEvent)
    parts.push(
      `inputType=${event.inputType} dataLen=${event.data?.length ?? -1} composing=${event.isComposing}`
    )
  if (event instanceof ClipboardEvent)
    parts.push(
      event.clipboardData === null
        ? 'clipboardData=null'
        : `types=${[...event.clipboardData.types].join('|')} textLen=${event.clipboardData.getData('text/plain').length} files=${event.clipboardData.files.length}`
    )
  setTimeout(() =>
    requestAnimationFrame(() => {
      const after = composer()?.value.length ?? -1
      const by = preventers.get(event)
      report(
        `${parts.join(' ')} lenAfter=${after} prevented=${event.defaultPrevented}${by === undefined ? '' : ` preventedBy=${by}`}${event.type === 'paste' && !event.defaultPrevented && after === before ? ' PASTE NOT APPLIED' : ''}`
      )
    })
  )
}

for (const type of ['keydown', 'beforeinput', 'paste', 'input'])
  document.addEventListener(type, watch, true)

document.addEventListener(
  'focusout',
  (event) => {
    if (event.target === textarea)
      report(`composer focusout to ${describe(event.relatedTarget)}`)
  },
  true
)
document.addEventListener(
  'focusin',
  (event) => {
    if (event.target === textarea) report('composer focusin')
  },
  true
)
window.addEventListener('blur', () => report('window blur'))
window.addEventListener('focus', () => report('window focus'))

new MutationObserver(() => {
  const current = composer()
  if (current === textarea) return
  if (current !== null) mounts += 1
  report(
    current === null
      ? `composer textarea UNMOUNTED (#${mounts})`
      : `composer textarea MOUNTED #${mounts} running=${running()} len=${current.value.length}`
  )
  textarea = current
}).observe(document.documentElement, { childList: true, subtree: true })

import.meta.hot?.on('vite:beforeUpdate', (payload) =>
  report(`hmr update ${payload.updates.map((update) => update.path).join(',')}`)
)
import.meta.hot?.on('vite:beforeFullReload', () => report('hmr full reload'))

report(`page loaded ${navigator.userAgent} ${location.href}`)
