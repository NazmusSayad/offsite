export type BrowserSize = { width: number; height: number; scale: number }

export type BrowserInput =
  | ({ type: 'open'; page: string; url: string } & BrowserSize)
  | ({ type: 'size' } & BrowserSize)
  | { type: 'ack' }
  | {
      type: 'mouse'
      action: 'down' | 'up' | 'move'
      x: number
      y: number
      button: 'none' | 'left' | 'middle' | 'right' | 'back' | 'forward'
      buttons: number
      clicks: number
      modifiers: number
    }
  | {
      type: 'wheel'
      x: number
      y: number
      deltaX: number
      deltaY: number
      modifiers: number
    }
  | {
      type: 'key'
      action: 'down' | 'up'
      key: string
      code: string
      keyCode: number
      text: string
      modifiers: number
    }
  | { type: 'text'; text: string }
  | { type: 'probe'; x: number; y: number }
  | { type: 'navigate'; url: string }
  | { type: 'back' }
  | { type: 'forward' }
  | { type: 'reload' }
  | { type: 'dialog'; accept: boolean; text: string }
  | { type: 'files'; files: { name: string; type: string; data: string }[] }

export type BrowserDialog = {
  kind: 'alert' | 'confirm' | 'prompt' | 'beforeunload'
  message: string
  value: string
}

export type BrowserOutput =
  | {
      type: 'state'
      url: string
      loading: boolean
      back: boolean
      forward: boolean
      error: string | null
    }
  | { type: 'viewport'; width: number; height: number }
  | { type: 'dialog'; dialog: BrowserDialog | null }
  | { type: 'probe'; editable: boolean }
  | { type: 'copy'; text: string }
  | { type: 'files'; multiple: boolean; accept: string }
  | { type: 'download'; name: string; token: string }
  | { type: 'installing' }
  | { type: 'error'; message: string }
