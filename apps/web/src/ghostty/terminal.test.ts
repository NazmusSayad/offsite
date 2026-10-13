import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { Terminal } from './terminal'
import { loadTestGhostty } from './test-runtime'

const options = {
  fontFamily: 'monospace',
  fontSize: 14,
  lineHeight: 1,
  ligatures: false,
  cursorStyle: 'block' as const,
  cursorBlink: false,
  scrollback: 100,
  boldIsBright: false,
  colors: {
    background: '#1c2025',
    foreground: '#abb2bf',
    cursor: '#ffffff',
    cursorText: '#000000',
    selectionBackground: '#333333',
    selectionForeground: '#ffffff',
    palette: Array.from(
      { length: 16 },
      (_, index) => `#${index.toString(16).padStart(2, '0').repeat(3)}`
    ),
  },
  version: 'sshtty 0.0.0',
  commandMarks: true,
  clickToMoveCursor: true,
  macosEditingKeys: true,
  optionAsMeta: 'off' as const,
  promptEvents: true,
}

function open() {
  const replies: string[] = []
  const terminal = new Terminal(options, {
    onData: vi.fn(),
    onReply: (data) => replies.push(data),
    onResize: vi.fn(),
    onTitle: vi.fn(),
    onProgress: vi.fn(),
    onBell: vi.fn(),
    onNotify: vi.fn(),
    onClipboard: vi.fn(),
    onClipboardRead: vi.fn(),
    onLink: vi.fn(),
    beforeKey: () => true,
  })
  function write(text: string, replay = false) {
    terminal.write(new TextEncoder().encode(text), replay)
  }
  function focus(type: 'focus' | 'blur') {
    terminal.element
      .querySelector('textarea')
      ?.dispatchEvent(new FocusEvent(type))
  }
  return { terminal, replies, write, focus }
}

describe('Terminal replies', () => {
  beforeAll(async () => {
    await loadTestGhostty()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      new Proxy(
        {},
        {
          get: (_, key) =>
            key === 'measureText'
              ? () => ({
                  width: 8,
                  fontBoundingBoxAscent: 12,
                  fontBoundingBoxDescent: 4,
                })
              : vi.fn(),
          set: () => true,
        }
      ) as CanvasRenderingContext2D
    )
  })

  let opened: ReturnType<typeof open> | null = null
  afterEach(() => {
    opened?.terminal.dispose()
    opened = null
  })

  it('answers color queries with the same terminator', () => {
    opened = open()
    opened.write('\x1b]11;?\x07\x1b]10;?\x1b\\\x1b]12;?\x07')
    expect(opened.replies).toEqual([
      '\x1b]11;rgb:1c1c/2020/2525\x07',
      '\x1b]10;rgb:abab/b2b2/bfbf\x1b\\',
      '\x1b]12;rgb:ffff/ffff/ffff\x07',
    ])
  })

  it('answers each valid palette query', () => {
    opened = open()
    opened.write('\x1b]4;1;?;4;?;300;?;x;?;5;#ff0000\x07')
    expect(opened.replies).toEqual([
      '\x1b]4;1;rgb:0101/0101/0101\x07',
      '\x1b]4;4;rgb:0404/0404/0404\x07',
    ])
  })

  it('answers with a color that the program set', () => {
    opened = open()
    opened.write('\x1b]11;#102030\x07\x1b]11;?\x07')
    expect(opened.replies).toEqual(['\x1b]11;rgb:1010/2020/3030\x07'])
  })

  it('keeps the order of its own replies and the core replies', () => {
    opened = open()
    opened.write('\x1b]11;?\x07\x1b[5n\x1b]10;?\x07')
    expect(opened.replies).toEqual([
      '\x1b]11;rgb:1c1c/2020/2525\x07',
      '\x1b[0n',
      '\x1b]10;rgb:abab/b2b2/bfbf\x07',
    ])
  })

  it('does not answer replayed output', () => {
    opened = open()
    opened.write('\x1b]11;?\x07\x1b]4;1;?\x07\x1b[?1004h', true)
    expect(opened.replies).toEqual([])
  })

  it('sends focus events only when the program turns them on', () => {
    opened = open()
    opened.focus('focus')
    opened.focus('blur')
    expect(opened.replies).toEqual([])
    opened.write('\x1b[?1004h')
    opened.focus('focus')
    opened.focus('blur')
    opened.write('\x1b[?1004l')
    opened.focus('focus')
    expect(opened.replies).toEqual(['\x1b[I', '\x1b[O'])
  })
})
