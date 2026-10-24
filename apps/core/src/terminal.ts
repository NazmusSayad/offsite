export type TerminalTab = {
  id: number
  customName: string | null
  minimized: boolean
}

export type TerminalProject = { tabs: TerminalTab[]; activeTab: number | null }

export type TerminalLayout = Record<string, TerminalProject>

export const GLOBAL_TERMINALS = 'global'

export type TerminalRequest =
  | { type: 'attach' }
  | { type: 'detach' }
  | { type: 'createTab'; projectId: string }
  | { type: 'closeTab'; id: number }
  | { type: 'renameTab'; id: number; name: string }
  | { type: 'minimizeTab'; id: number }
  | { type: 'select'; projectId: string; tabId: number | null }
  | { type: 'resize'; id: number; cols: number; rows: number }

export type TerminalEvent =
  | { type: 'active'; layout: TerminalLayout; instance: string }
  | { type: 'layout'; layout: TerminalLayout }

export type Shell = { name: string; path: string }

export type BusyResult = { program: string | null } | { error: string }

export const FRAME_INPUT = 0
export const FRAME_REPLY = 1
export const FRAME_OUTPUT = 2
export const FRAME_REPLAY = 3

export function encodeFrame(kind: number, id: number, data: Uint8Array) {
  const frame = new Uint8Array(5 + data.length)
  frame[0] = kind
  new DataView(frame.buffer).setUint32(1, id)
  frame.set(data, 5)
  return frame
}

export function decodeFrame(frame: Uint8Array) {
  if (frame.length < 5) {
    throw new Error('terminal frame is too short')
  }
  return {
    kind: frame[0],
    id: new DataView(
      frame.buffer,
      frame.byteOffset,
      frame.byteLength
    ).getUint32(1),
    data: frame.subarray(5),
  }
}
