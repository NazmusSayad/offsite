import { describe, expect, it } from 'vitest'
import { OutputScanner } from './output'

function scan(...chunks: string[]) {
  const scanner = new OutputScanner()
  const events: { text: string; terminator: string; end: number }[] = []
  for (const chunk of chunks)
    {scanner.scan(new TextEncoder().encode(chunk), (event, end) => {
      if (event.type !== 'osc') throw new Error(`unexpected ${event.type}`)
      events.push({
        text: new TextDecoder().decode(event.data),
        terminator: event.terminator,
        end,
      })
      return false
    })}
  return events
}

describe('OutputScanner', () => {
  it('keeps the BEL terminator of an OSC', () => {
    expect(scan('ab\x1b]11;?\x07cd')).toEqual([
      { text: '11;?', terminator: '\x07', end: 9 },
    ])
  })

  it('keeps the ST terminator of an OSC', () => {
    expect(scan('\x1b]10;?\x1b\\')).toEqual([
      { text: '10;?', terminator: '\x1b\\', end: 8 },
    ])
  })

  it('keeps the terminator of an OSC split over chunks', () => {
    expect(scan('\x1b]4;1', ';?\x1b', '\\')).toEqual([
      { text: '4;1;?', terminator: '\x1b\\', end: 1 },
    ])
  })
})
