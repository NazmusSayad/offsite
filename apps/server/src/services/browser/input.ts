import type { Input, Tab } from './tabs.ts'

const MOUSE_EVENTS = {
  down: 'mousePressed',
  up: 'mouseReleased',
  move: 'mouseMoved',
} as const

export async function dispatch(
  tab: Tab,
  input: Extract<Input, { type: 'mouse' | 'wheel' | 'key' | 'text' }>
) {
  if (input.type === 'mouse') {
    await tab.cdp.send('Input.dispatchMouseEvent', {
      type: MOUSE_EVENTS[input.action],
      x: input.x,
      y: input.y,
      button: input.button,
      buttons: input.buttons,
      clickCount: input.clicks,
      modifiers: input.modifiers,
    })
    return
  }
  if (input.type === 'wheel') {
    await tab.cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: input.x,
      y: input.y,
      deltaX: input.deltaX,
      deltaY: input.deltaY,
      modifiers: input.modifiers,
    })
    return
  }
  if (input.type === 'text') {
    await tab.cdp.send('Input.insertText', { text: input.text })
    return
  }
  if (input.action === 'up') {
    await tab.cdp.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: input.key,
      code: input.code,
      windowsVirtualKeyCode: input.keyCode,
      modifiers: input.modifiers,
    })
    return
  }
  await tab.cdp.send('Input.dispatchKeyEvent', {
    type: input.text === '' ? 'rawKeyDown' : 'keyDown',
    key: input.key,
    code: input.code,
    windowsVirtualKeyCode: input.keyCode,
    text: input.text,
    unmodifiedText: input.text,
    modifiers: input.modifiers,
    commands: editingCommands(input.key, input.modifiers),
  })
}

function editingCommands(key: string, modifiers: number) {
  const modifier = modifiers & 0b0111
  if (modifier !== 2 && modifier !== 4) {
    return []
  }
  const letter = key.toLowerCase()
  if (letter === 'c') {
    return ['copy']
  }
  if (letter === 'x') {
    return ['cut']
  }
  if (modifier !== 4) {
    return []
  }
  if (letter === 'a') {
    return ['selectAll']
  }
  if (letter === 'z') {
    return [(modifiers & 8) === 0 ? 'undo' : 'redo']
  }
  return []
}
