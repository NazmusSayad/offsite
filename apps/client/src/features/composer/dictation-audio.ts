const sampleRate = 16000

export async function toWav(blob: Blob) {
  const decoded = await new OfflineAudioContext(
    1,
    1,
    sampleRate
  ).decodeAudioData(await blob.arrayBuffer())
  if (decoded.length === 0) {
    throw new Error('The recording has no audio')
  }
  const channels = Array.from(
    { length: decoded.numberOfChannels },
    (_, index) => decoded.getChannelData(index)
  )
  const view = new DataView(new ArrayBuffer(44 + decoded.length * 2))
  writeText(view, 0, 'RIFF')
  view.setUint32(4, 36 + decoded.length * 2, true)
  writeText(view, 8, 'WAVE')
  writeText(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeText(view, 36, 'data')
  view.setUint32(40, decoded.length * 2, true)
  for (let index = 0; index < decoded.length; index++) {
    let sum = 0
    for (const channel of channels) {
      sum += channel[index]
    }
    const sample = Math.max(-1, Math.min(1, sum / channels.length))
    view.setInt16(44 + index * 2, sample * 0x7fff, true)
  }
  return new Blob([view], { type: 'audio/wav' })
}

function writeText(view: DataView, offset: number, text: string) {
  for (let index = 0; index < text.length; index++) {
    view.setUint8(offset + index, text.charCodeAt(index))
  }
}
