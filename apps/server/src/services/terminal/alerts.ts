const PAYLOAD_LIMIT = 1024
const ESC = 0x1b
const BEL = 0x07
const CAN = 0x18
const SUB = 0x1a

export class Scanner {
  directory: string | null = null
  private state:
    | 'ground'
    | 'escape'
    | 'osc'
    | 'oscEscape'
    | 'text'
    | 'textEscape' = 'ground'
  private payload: number[] = []

  scan(bytes: Uint8Array) {
    let index = 0
    while (index < bytes.length) {
      if (this.state === 'ground') {
        let offset = index
        while (offset < bytes.length && bytes[offset] !== ESC) {
          offset++
        }
        if (offset === bytes.length) {
          break
        }
        index = offset
      }
      this.step(bytes[index])
      index++
    }
  }

  private step(byte: number) {
    if (byte === CAN || byte === SUB) {
      this.state = 'ground'
      return
    }
    switch (this.state) {
      case 'ground':
        if (byte === ESC) {
          this.state = 'escape'
        }
        return
      case 'escape':
        if (byte === 0x5d) {
          this.payload = []
          this.state = 'osc'
        } else if ([0x50, 0x58, 0x5e, 0x5f].includes(byte)) {
          this.state = 'text'
        } else if (byte !== ESC) {
          this.state = 'ground'
        }
        return
      case 'osc':
        if (byte === BEL) {
          this.state = 'ground'
          this.finish()
          return
        }
        if (byte === ESC) {
          this.state = 'oscEscape'
        } else if (this.payload.length < PAYLOAD_LIMIT) {
          this.payload.push(byte)
        }
        return
      case 'oscEscape':
        if (byte === 0x5c) {
          this.state = 'ground'
          this.finish()
          return
        }
        this.state = 'escape'
        this.step(byte)
        return
      case 'text':
        if (byte === ESC) {
          this.state = 'textEscape'
        }
        return
      case 'textEscape':
        if (byte === 0x5c) {
          this.state = 'ground'
          return
        }
        this.state = 'escape'
        this.step(byte)
    }
  }

  private finish() {
    const text = Buffer.from(this.payload).toString('utf8')
    if (text.startsWith('9;9;')) {
      this.directory = text.slice(4).replace(/^"(.*)"$/, '$1')
    }
  }
}
