import type { Colors } from './core'
import type { Color } from './render-state'

export type Progress = { state: number; value: number }

const decoder = new TextDecoder()

function colorSpec(color: Color) {
  function channel(value: number) {
    return value.toString(16).padStart(2, '0').repeat(2)
  }
  return `rgb:${channel(color.r)}/${channel(color.g)}/${channel(color.b)}`
}

function percent(value: number) {
  return Math.min(Math.max(value, 0), 100)
}

function decodeBase64(payload: string) {
  return decoder.decode(
    Uint8Array.from(atob(payload), (character) => character.charCodeAt(0))
  )
}

export function xtermSelection(value: string) {
  if (value === '') {return 's0'}
  return [...value].filter((letter) => 'cpqs01234567'.includes(letter)).join('')
}

export function clipboardText(payload: string) {
  try {
    return decodeBase64(payload)
  } catch (error) {
    console.warn('invalid clipboard sequence', error)
    return null
  }
}

export function clipboardReply(
  text: string,
  selection: string,
  terminator: string
) {
  const binary = Array.from(new TextEncoder().encode(text), (byte) =>
    String.fromCharCode(byte)
  ).join('')
  return `\x1b]52;${selection};${btoa(binary)}${terminator}`
}

export function colorReply(
  query: '10;?' | '11;?' | '12;?',
  colors: Colors,
  terminator: string
) {
  const color =
    query === '10;?'
      ? colors.foreground
      : query === '11;?'
        ? colors.background
        : colors.cursor
  return `\x1b]${query.slice(0, 2)};${colorSpec(color)}${terminator}`
}

export function paletteReplies(
  text: string,
  palette: Color[],
  terminator: string
) {
  const parts = text.split(';')
  const replies: string[] = []
  for (let index = 1; index + 1 < parts.length; index += 2) {
    if (parts[index + 1] !== '?' || !/^\d+$/.test(parts[index])) {continue}
    const color = palette[Number(parts[index])]
    if (color === undefined) {continue}
    replies.push(`\x1b]4;${parts[index]};${colorSpec(color)}${terminator}`)
  }
  return replies
}

export function nextProgress(text: string, current: Progress) {
  const parts = text.split(';')
  if (parts.length > 4) {return null}
  const state = parts[2] === undefined || parts[2] === '' ? 0 : Number(parts[2])
  const value =
    parts[3] === undefined || parts[3] === '' ? -1 : Number(parts[3])
  if (!Number.isInteger(state) || !Number.isInteger(value)) {return null}
  if (state === 0) {return { state, value: 0 }}
  if (state === 1) {
    if (value < 0) {return null}
    return { state, value: percent(value) }
  }
  if (state === 2 || state === 4) {
    if (value < 0) {return { state, value: current.value }}
    return { state, value: percent(value || current.value) }
  }
  if (state === 3) {return { state, value: current.value }}
  return null
}

export function textNotification(text: string, data: Uint8Array) {
  if (text.startsWith('9;') && !/^9;\d+(;|$)/.test(text))
    {return { title: '', body: decoder.decode(data.subarray(2)) }}
  if (text.startsWith('777;notify;')) {
    const parts = decoder.decode(data).split(';')
    return { title: parts[2] ?? '', body: parts.slice(3).join(';') }
  }
  return null
}

export class KittyNotifications {
  private pending = { id: '', title: '', body: '' }

  add(text: string) {
    const separator = text.indexOf(';', 3)
    if (separator === -1) {return null}
    const fields = new Map<string, string>()
    for (const field of text.slice(3, separator).split(':')) {
      const equals = field.indexOf('=')
      if (equals !== -1)
        {fields.set(field.slice(0, equals), field.slice(equals + 1))}
    }
    const kind = fields.get('p') ?? 'title'
    if (kind === '?' || kind === 'close' || kind === 'alive') {return null}
    let payload = text.slice(separator + 1)
    if (fields.get('e') === '1') {
      try {
        payload = decodeBase64(payload)
      } catch (error) {
        console.warn('invalid notification sequence', error)
        return null
      }
    }
    const id = fields.get('i') ?? ''
    if (id !== this.pending.id) {this.pending = { id, title: '', body: '' }}
    if (kind === 'title') {this.pending.title += payload}
    if (kind === 'body') {this.pending.body += payload}
    if (fields.get('d') === '0') {return null}
    const notification = this.pending
    this.pending = { id: '', title: '', body: '' }
    if (notification.title === '' && notification.body === '') {return null}
    return { title: notification.title, body: notification.body }
  }
}
