import { Terminal } from '@/lib/ghostty/terminal'
import { getState as appState, machineOf } from '@/lib/store'
import { openBrowser } from '@/lib/url'
import { isWindows } from '@/lib/utils'
import { beep, isSeen, notifyFromProgram, ringBell } from './attention'
import {
  imagePasteKeys,
  isImagePasteKey,
  pasteClipboardImages,
  pasteImages,
  readClipboard,
  reportPasteError,
  writeClipboard,
} from './clipboard'
import {
  currentOptions,
  getState,
  isFindShortcut,
  send,
  sendInput,
  sendReply,
  setState,
  terminalConfig,
  terminalMachine,
} from './session'

function isShiftEnter(event: KeyboardEvent) {
  return (
    event.key === 'Enter' &&
    event.shiftKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.metaKey
  )
}

export function createSession(id: number) {
  const terminal = new Terminal(currentOptions(), {
    onData: (data) => {
      if (getState().status !== 'active') {
        return
      }
      sendInput(id, applyCtrl(data))
    },
    onReply: (data) => {
      if (data === '\x1b[I' || data === '\x1b[O') {
        sendInput(id, data)
      } else {
        sendReply(id, data)
      }
    },
    onResize: (cols, rows) => send({ type: 'resize', id, cols, rows }),
    onTitle: (title) =>
      setState({ titles: { ...getState().titles, [id]: title } }),
    onProgress: (progress) =>
      setState({ progress: { ...getState().progress, [id]: progress } }),
    onBell: () => {
      const behavior = terminalConfig().behavior
      if (behavior.bellSound) {
        beep()
      }
      if (
        behavior.bellFlash &&
        terminal.element.isConnected &&
        !document.hidden
      ) {
        terminal.element.animate([{ opacity: 0.4 }, { opacity: 1 }], {
          duration: 200,
          easing: 'ease-out',
        })
      }
      ringBell(id)
    },
    onNotify: (title, body) => notifyFromProgram(id, title, body),
    onClipboard: writeClipboard,
    onClipboardRead: (query) => {
      if (!isSeen(id)) {
        return
      }
      void readClipboard((text) => terminal.replyClipboard(text, query))
    },
    onLink: (uri) => {
      if (uri.startsWith('file:')) {
        openBrowser(uri)
        return
      }
      window.open(uri, '_blank', 'noopener')
    },
    beforeKey: (event) => {
      if (event.type !== 'keydown') {
        return true
      }
      const config = terminalConfig()
      const system = machineOf(appState(), terminalMachine()).system
      if (system === null) {
        throw new Error('the terminal machine is not connected')
      }
      const platform = system.platform
      if (
        getState().status === 'active' &&
        config.behavior.modernizeShiftEnter &&
        isShiftEnter(event) &&
        !terminal.isKittyKeyboard()
      ) {
        event.preventDefault()
        terminal.beforeInput('\x1b\r')
        sendInput(id, '\x1b\r')
        return false
      }
      if (
        getState().status === 'active' &&
        config.behavior.pasteBrowserImages &&
        window.isSecureContext &&
        isImagePasteKey(event, platform) &&
        !(isWindows && config.behavior.windowsCopyPaste && event.ctrlKey)
      ) {
        event.preventDefault()
        const data = imagePasteKeys[platform].data
        terminal.beforeInput(data)
        pasteClipboardImages(terminalMachine(), terminal)
          .then((pasted) => {
            if (!pasted) {
              sendInput(id, data)
            }
          })
          .catch((error: unknown) => {
            reportPasteError(error)
            sendInput(id, data)
          })
        return false
      }
      if (!isFindShortcut(event)) {
        return true
      }
      event.preventDefault()
      setState({ finding: id })
      document.querySelector<HTMLInputElement>('[data-find]')?.select()
      return false
    },
  })
  terminal.element.addEventListener(
    'paste',
    (event) => {
      if (!event.clipboardData) {
        return
      }
      if (event.clipboardData.getData('text/plain') !== '') {
        return
      }
      const images = [...event.clipboardData.files].filter((file) =>
        file.type.startsWith('image/')
      )
      if (images.length === 0) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      pasteImages(terminalMachine(), terminal, images).catch(reportPasteError)
    },
    true
  )
  return terminal
}

function applyCtrl(data: string) {
  if (!getState().ctrl) {
    return data
  }
  setState({ ctrl: false })
  if (data.length !== 1) {
    return data
  }
  const code = data.toUpperCase().charCodeAt(0)
  if (code >= 64 && code <= 95) {
    return String.fromCharCode(code - 64)
  }
  return data
}
