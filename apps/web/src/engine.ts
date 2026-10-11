export type Engine = 'ghostty' | 'xterm'

export type TerminalColors = {
  background: string
  foreground: string
  cursor: string
  cursorText: string
  selectionBackground: string
  selectionForeground: string
  palette: string[]
}

export type TerminalOptions = {
  fontFamily: string
  fontSize: number
  lineHeight: number
  ligatures: boolean
  cursorStyle: 'block' | 'bar' | 'underline'
  cursorBlink: boolean
  scrollback: number
  boldIsBright: boolean
  colors: TerminalColors
}

export type TerminalHandlers = {
  onData: (data: string) => void
  onReply: (data: string | Uint8Array) => void
  onResize: (cols: number, rows: number) => void
  onTitle: (title: string) => void
  onProgress: (progress: Progress) => void
  onClipboard: (text: string) => void
  onLink: (uri: string, event: MouseEvent) => void
  beforeKey: (event: KeyboardEvent) => boolean
}

export type Progress = { state: number; value: number }

export type FindResults = { resultIndex: number; resultCount: number }

export type EngineTerminal = {
  readonly element: HTMLElement
  readonly cols: number
  readonly rows: number
  write: (data: Uint8Array, replay: boolean) => void
  reset: () => void
  focus: () => void
  paste: (text: string) => void
  fit: () => void
  find: (text: string, backwards: boolean, incremental: boolean) => void
  onFindResults: (listener: (results: FindResults) => void) => () => void
  clearFind: () => void
  setOptions: (options: TerminalOptions) => void
  dispose: () => void
}

export type EngineConstructor = new (
  options: TerminalOptions,
  handlers: TerminalHandlers
) => EngineTerminal

export async function loadEngine(engine: Engine): Promise<EngineConstructor> {
  if (engine === 'ghostty') {
    const [{ loadGhostty }, { Terminal }] = await Promise.all([
      import('./ghostty/runtime'),
      import('./ghostty/terminal'),
    ])
    await loadGhostty()
    return Terminal
  }
  if (engine === 'xterm') {
    const { Terminal } = await import('./xterm/terminal')
    return Terminal
  }
  throw new Error(`unknown terminal engine ${String(engine)}`)
}
