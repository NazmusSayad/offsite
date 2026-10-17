export type OutputEvent =
  | { type: 'osc'; data: Uint8Array; terminator: string }
  | { type: 'sixel'; data: Uint8Array }

type State =
  | 'ground'
  | 'escape'
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
  private state: State = 'ground'
  private params = ''
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
        if (byte === ESC) {
          this.state = 'escape'
        }
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
        this.state = byte === ESC ? 'escape' : 'ground'
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
          ) {
            return index + 1
          }
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
          ) {
            return index + 1
          }
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
          if (this.params.length < 16) {
            this.params += String.fromCharCode(byte)
          }
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
        if (this.collecting) {
          if (onEvent({ type: 'sixel', data: this.take() }, index + 1))
            return index + 1
        }
        continue
      }
      this.drop()
      this.state = 'escape'
      index -= 1
    }
    if (this.state === 'osc' || this.state === 'dcs') {
      this.append(bytes, start, bytes.length)
    }
    return bytes.length
  }

  private begin() {
    this.collecting = true
    this.chunks = []
    this.size = 0
  }

  private append(bytes: Uint8Array, start: number, end: number) {
    if (!this.collecting || end <= start) {
      return
    }
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
