export const ALERT_DELAY = 500

export type Alert =
  | { type: 'bell' }
  | { type: 'notification'; title: string; body: string }

const BELL_GAP = 5000
const NOTIFICATION_GAP = 1000
const PAYLOAD_LIMIT = 1024
const ESC = 0x1b
const BEL = 0x07
const CAN = 0x18
const SUB = 0x1a

export class Scanner {
  title = ''
  private state:
    | 'ground'
    | 'escape'
    | 'osc'
    | 'oscEscape'
    | 'text'
    | 'textEscape' = 'ground'
  private payload: number[] = []

  scan(bytes: Uint8Array) {
    let alert: Alert | null = null
    let index = 0
    while (index < bytes.length) {
      if (this.state === 'ground') {
        let offset = index
        while (
          offset < bytes.length &&
          bytes[offset] !== ESC &&
          bytes[offset] !== BEL
        )
          offset++
        if (offset === bytes.length) break
        index = offset
      }
      const found = this.step(bytes[index])
      index++
      if (found === null) continue
      if (found.type === 'bell') alert ??= found
      else alert = found
    }
    return alert
  }

  private step(byte: number): Alert | null {
    if (byte === CAN || byte === SUB) {
      this.state = 'ground'
      return null
    }
    switch (this.state) {
      case 'ground':
        if (byte === ESC) this.state = 'escape'
        if (byte === BEL) return { type: 'bell' }
        return null
      case 'escape':
        if (byte === 0x5d) {
          this.payload = []
          this.state = 'osc'
        } else if ([0x50, 0x58, 0x5e, 0x5f].includes(byte)) this.state = 'text'
        else if (byte !== ESC) this.state = 'ground'
        if (byte === BEL) return { type: 'bell' }
        return null
      case 'osc':
        if (byte === BEL) {
          this.state = 'ground'
          return this.finish()
        }
        if (byte === ESC) this.state = 'oscEscape'
        else if (this.payload.length < PAYLOAD_LIMIT) this.payload.push(byte)
        return null
      case 'oscEscape':
        if (byte === 0x5c) {
          this.state = 'ground'
          return this.finish()
        }
        this.state = 'escape'
        return this.step(byte)
      case 'text':
        if (byte === ESC) this.state = 'textEscape'
        return null
      case 'textEscape':
        if (byte === 0x5c) {
          this.state = 'ground'
          return null
        }
        this.state = 'escape'
        return this.step(byte)
    }
  }

  private finish(): Alert | null {
    const text = Buffer.from(this.payload).toString('utf8')
    if (text.startsWith('0;') || text.startsWith('2;')) {
      this.title = text.slice(2)
      return null
    }
    if (text.startsWith('9;')) {
      const body = text.slice(2)
      const digits = /^\d*/.exec(body)?.[0].length ?? 0
      if (digits > 0 && (body.length === digits || body[digits] === ';'))
        return null
      return { type: 'notification', title: '', body }
    }
    if (text.startsWith('777;notify;')) {
      const rest = text.slice('777;notify;'.length)
      const split = rest.indexOf(';')
      return split === -1
        ? { type: 'notification', title: rest, body: '' }
        : {
            type: 'notification',
            title: rest.slice(0, split),
            body: rest.slice(split + 1),
          }
    }
    return null
  }
}

export class Alerts {
  private pushedAt: number | null = null
  private bellPending = false

  startBell() {
    if (this.bellPending || this.pushedRecently(BELL_GAP)) return false
    this.bellPending = true
    return true
  }

  finishBell() {
    if (!this.bellPending) return false
    this.bellPending = false
    this.pushedAt = Date.now()
    return true
  }

  startNotification() {
    this.bellPending = false
    if (this.pushedRecently(NOTIFICATION_GAP)) return false
    this.pushedAt = Date.now()
    return true
  }

  private pushedRecently(gap: number) {
    return this.pushedAt !== null && Date.now() - this.pushedAt < gap
  }
}
