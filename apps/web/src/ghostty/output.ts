export type OutputEvent =
  | { type: 'osc'; data: Uint8Array; terminator: string }
  | { type: 'sixel'; data: Uint8Array }
  | { type: 'clear' }
  | { type: 'clearBelow' }
  | { type: 'clearScrollback' }
  | { type: 'alternate' }

type State =
  | 'ground'
  | 'escape'
  | 'csi'
  | 'osc'
  | 'oscEscape'
  | 'dcsHeader'
  | 'dcs'
  | 'dcsEscape'

const ESC = 0x1b
const BEL = 0x07
const CAN = 0x18
const SUB = 0x1a
const PAYLOAD_LIMIT = 32 * 1024 * 1024

export class OutputScanner {
  screenEvents = false
  private state: State = 'ground'
  private params = ''
  private csiParam = 0
  private csiPrivate = false
  private collecting = false
  private chunks: Uint8Array[] = []
  private size = 0

  reset() {
    this.state = 'ground'
    this.drop()
  }

  scan(
    bytes: Uint8Array,
    onEvent: (event: OutputEvent, end: number) => boolean
  ) {
    let start = 0
    for (let index = 0; index < bytes.length; index += 1) {
      const byte = bytes[index]
      if (byte === CAN || byte === SUB) {
        this.state = 'ground'
        this.drop()
        continue
      }
      if (this.state === 'ground') {
        if (byte === ESC) this.state = 'escape'
        continue
      }
      if (this.state === 'escape') {
        this.params = ''
        if (byte === 0x5d) {
          this.state = 'osc'
          this.begin()
          start = index + 1
          continue
        }
        if (byte === 0x50) {
          this.state = 'dcsHeader'
          continue
        }
        if (byte === 0x5b && this.screenEvents) {
          this.state = 'csi'
          this.csiParam = 0
          this.csiPrivate = false
          continue
        }
        this.state = byte === ESC ? 'escape' : 'ground'
        continue
      }
      if (this.state === 'csi') {
        if (byte >= 0x30 && byte <= 0x39) {
          this.csiParam =
            this.csiParam >= 0 && this.csiParam < 100000
              ? this.csiParam * 10 + byte - 0x30
              : -1
          continue
        }
        if (byte >= 0x20 && byte <= 0x3f) {
          if (byte === 0x3f && this.csiParam === 0 && !this.csiPrivate)
            this.csiPrivate = true
          else this.csiParam = -1
          continue
        }
        if (byte === ESC) {
          this.state = 'escape'
          continue
        }
        if (byte < 0x20) continue
        this.state = 'ground'
        if (this.csiPrivate) {
          if (
            byte === 0x68 &&
            (this.csiParam === 1049 ||
              this.csiParam === 1047 ||
              this.csiParam === 47)
          )
            if (onEvent({ type: 'alternate' }, index)) return index
          continue
        }
        if (byte === 0x4a && this.csiParam === 0)
          if (onEvent({ type: 'clearBelow' }, index + 1)) return index + 1
        if (byte === 0x4a && this.csiParam === 2)
          if (onEvent({ type: 'clear' }, index + 1)) return index + 1
        if (byte === 0x4a && this.csiParam === 3)
          if (onEvent({ type: 'clearScrollback' }, index)) return index
        continue
      }
      if (this.state === 'osc') {
        if (byte === BEL) {
          this.state = 'ground'
          this.append(bytes, start, index)
          if (
            onEvent(
              { type: 'osc', data: this.take(), terminator: '\x07' },
              index + 1
            )
          )
            return index + 1
          continue
        }
        if (byte === ESC) {
          this.state = 'oscEscape'
          this.append(bytes, start, index)
        }
        continue
      }
      if (this.state === 'oscEscape') {
        if (byte === 0x5c) {
          this.state = 'ground'
          if (
            onEvent(
              { type: 'osc', data: this.take(), terminator: '\x1b\\' },
              index + 1
            )
          )
            return index + 1
          continue
        }
        this.drop()
        this.state = 'escape'
        index -= 1
        continue
      }
      if (this.state === 'dcsHeader') {
        if (byte === ESC) {
          this.state = 'dcsEscape'
          continue
        }
        if (byte >= 0x20 && byte <= 0x3f) {
          if (this.params.length < 16) this.params += String.fromCharCode(byte)
          continue
        }
        this.state = 'dcs'
        if (byte === 0x71 && /^[0-9;]*$/.test(this.params)) {
          this.begin()
          start = index + 1
        }
        continue
      }
      if (this.state === 'dcs') {
        if (byte === ESC) {
          this.state = 'dcsEscape'
          this.append(bytes, start, index)
        }
        continue
      }
      if (byte === 0x5c) {
        this.state = 'ground'
        if (this.collecting)
          if (onEvent({ type: 'sixel', data: this.take() }, index + 1))
            return index + 1
        continue
      }
      this.drop()
      this.state = 'escape'
      index -= 1
    }
    if (this.state === 'osc' || this.state === 'dcs')
      this.append(bytes, start, bytes.length)
    return bytes.length
  }

  private begin() {
    this.collecting = true
    this.chunks = []
    this.size = 0
  }

  private append(bytes: Uint8Array, start: number, end: number) {
    if (!this.collecting || end <= start) return
    if (this.size + end - start > PAYLOAD_LIMIT) {
      this.drop()
      return
    }
    this.chunks.push(bytes.slice(start, end))
    this.size += end - start
  }

  private take() {
    const data = new Uint8Array(this.size)
    let offset = 0
    for (const chunk of this.chunks) {
      data.set(chunk, offset)
      offset += chunk.length
    }
    this.drop()
    return data
  }

  private drop() {
    this.collecting = false
    this.chunks = []
    this.size = 0
  }
}
