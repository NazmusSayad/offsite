import '@xterm/xterm/css/xterm.css'
import { ClipboardAddon } from '@xterm/addon-clipboard'
import { FitAddon } from '@xterm/addon-fit'
import { ImageAddon } from '@xterm/addon-image'
import { LigaturesAddon } from '@xterm/addon-ligatures'
import { ProgressAddon } from '@xterm/addon-progress'
import { SearchAddon } from '@xterm/addon-search'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { WebglAddon } from '@xterm/addon-webgl'
import { type ITerminalOptions, Terminal as Xterm } from '@xterm/xterm'
import type {
  EngineTerminal,
  FindResults,
  TerminalHandlers,
  TerminalOptions,
} from '../engine'

const isMac = navigator.userAgent.includes('Mac')

const paletteKeys = [
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
  'brightBlack',
  'brightRed',
  'brightGreen',
  'brightYellow',
  'brightBlue',
  'brightMagenta',
  'brightCyan',
  'brightWhite',
] as const

function xtermOptions(options: TerminalOptions): ITerminalOptions {
  const colors = options.colors
  return {
    fontFamily: options.fontFamily,
    fontSize: options.fontSize,
    lineHeight: options.lineHeight,
    cursorStyle: options.cursorStyle,
    cursorBlink: options.cursorBlink,
    scrollback: options.scrollback,
    drawBoldTextInBrightColors: options.boldIsBright,
    theme: {
      background: colors.background,
      foreground: colors.foreground,
      cursor: colors.cursor,
      cursorAccent: colors.cursorText,
      selectionBackground: colors.selectionBackground,
      selectionForeground: colors.selectionForeground,
      ...Object.fromEntries(
        paletteKeys.map((key, index) => [key, colors.palette[index]])
      ),
    },
  }
}

export class Terminal implements EngineTerminal {
  readonly element: HTMLDivElement
  private readonly terminal: Xterm
  private readonly handlers: TerminalHandlers
  private readonly fitAddon = new FitAddon()
  private readonly search = new SearchAddon()
  private readonly observer: ResizeObserver
  private options: TerminalOptions
  private ligatures: LigaturesAddon | null = null
  private opened = false
  private replays = 0

  constructor(options: TerminalOptions, handlers: TerminalHandlers) {
    this.options = options
    this.handlers = handlers
    this.element = document.createElement('div')
    this.element.className = 'h-full'
    this.terminal = new Xterm({
      ...xtermOptions(options),
      allowProposedApi: true,
      linkHandler: { activate: (event, uri) => this.openLink(event, uri) },
    })
    this.terminal.loadAddon(this.fitAddon)
    this.terminal.loadAddon(new Unicode11Addon())
    this.terminal.unicode.activeVersion = '11'
    this.terminal.loadAddon(new ImageAddon())
    this.terminal.loadAddon(
      new WebLinksAddon((event, uri) => this.openLink(event, uri))
    )
    this.terminal.loadAddon(
      new ClipboardAddon(undefined, {
        readText: () => '',
        writeText: (_selection, text) => {
          if (this.replays > 0) return
          handlers.onClipboard(text)
        },
      })
    )
    this.terminal.loadAddon(this.search)
    const progress = new ProgressAddon()
    this.terminal.loadAddon(progress)
    progress.onChange((value) => handlers.onProgress(value))
    this.terminal.attachCustomKeyEventHandler((event) =>
      handlers.beforeKey(event)
    )
    this.terminal.onData((data) => {
      if (this.replays > 0) return
      handlers.onData(data)
    })
    this.terminal.onBinary((data) => {
      if (this.replays > 0) return
      handlers.onReply(
        Uint8Array.from(data, (character) => character.charCodeAt(0))
      )
    })
    this.terminal.onTitleChange((title) => handlers.onTitle(title))
    this.terminal.onResize((size) => handlers.onResize(size.cols, size.rows))
    this.observer = new ResizeObserver(() => this.fit())
    this.observer.observe(this.element)
  }

  get cols() {
    return this.terminal.cols
  }

  get rows() {
    return this.terminal.rows
  }

  write(data: Uint8Array, replay: boolean) {
    if (!replay) {
      this.terminal.write(data)
      return
    }
    this.replays += 1
    this.terminal.write(data, () => {
      this.replays -= 1
    })
  }

  reset() {
    this.terminal.reset()
  }

  focus() {
    this.terminal.focus()
  }

  paste(text: string) {
    this.terminal.paste(text)
  }

  fit() {
    if (!this.element.isConnected) return
    if (!this.opened) {
      this.opened = true
      this.terminal.open(this.element)
      this.terminal.options = xtermOptions(this.options)
      const webgl = new WebglAddon()
      webgl.onContextLoss(() => webgl.dispose())
      this.terminal.loadAddon(webgl)
      this.syncLigatures()
    }
    this.fitAddon.fit()
  }

  find(text: string, backwards: boolean, incremental: boolean) {
    const colors = this.options.colors
    const options = {
      incremental,
      decorations: {
        matchBackground: colors.palette[8],
        matchOverviewRuler: colors.palette[8],
        activeMatchBorder: colors.palette[3],
        activeMatchColorOverviewRuler: colors.palette[3],
      },
    }
    if (backwards) this.search.findPrevious(text, options)
    else this.search.findNext(text, options)
  }

  onFindResults(listener: (results: FindResults) => void) {
    const subscription = this.search.onDidChangeResults(listener)
    return () => subscription.dispose()
  }

  clearFind() {
    this.search.clearDecorations()
  }

  setOptions(options: TerminalOptions) {
    this.options = options
    if (!this.opened) return
    this.terminal.options = xtermOptions(options)
    this.syncLigatures()
    this.fit()
  }

  dispose() {
    this.observer.disconnect()
    this.terminal.dispose()
    this.element.remove()
  }

  private openLink(event: MouseEvent, uri: string) {
    if (isMac ? event.metaKey : event.ctrlKey) this.handlers.onLink(uri, event)
  }

  private syncLigatures() {
    if (this.options.ligatures && !this.ligatures) {
      this.ligatures = new LigaturesAddon()
      this.terminal.loadAddon(this.ligatures)
    }
    if (!this.options.ligatures && this.ligatures) {
      this.ligatures.dispose()
      this.ligatures = null
    }
  }
}
