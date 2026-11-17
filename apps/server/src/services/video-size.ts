import { type FileHandle, open } from 'node:fs/promises'

const SEGMENT = 0x18538067
const TRACKS = 0x1654ae6b
const TRACK_ENTRY = 0xae
const VIDEO = 0xe0
const PIXEL_WIDTH = 0xb0
const PIXEL_HEIGHT = 0xba
const CLUSTER = 0x1f43b675
const WEBM_HEAD = 1024 * 1024

export async function videoSize(file: string, mediaType: string) {
  try {
    const handle = await open(file, 'r')
    try {
      if (mediaType === 'video/mp4' || mediaType === 'video/quicktime') {
        return await mp4Size(handle)
      }
      if (mediaType === 'video/webm') {
        const head = Buffer.alloc(
          Math.min(WEBM_HEAD, (await handle.stat()).size)
        )
        await handle.read(head, 0, head.length, 0)
        return webmSize(head)
      }
      return null
    } finally {
      await handle.close()
    }
  } catch {
    return null
  }
}

async function mp4Size(handle: FileHandle) {
  const length = (await handle.stat()).size
  let offset = 0
  while (offset + 8 <= length) {
    const header = Buffer.alloc(16)
    await handle.read(header, 0, header.length, offset)
    const box = boxHeader(header, 0, length - offset)
    if (box.size < box.header) {
      throw new Error('The video file is damaged')
    }
    if (box.type === 'moov') {
      const moov = Buffer.alloc(box.size - box.header)
      await handle.read(moov, 0, moov.length, offset + box.header)
      return moovSize(moov)
    }
    offset += box.size
  }
  return null
}

function boxHeader(buffer: Buffer, offset: number, remaining: number) {
  const size = buffer.readUInt32BE(offset)
  const type = buffer.toString('latin1', offset + 4, offset + 8)
  if (size === 1) {
    return {
      type,
      header: 16,
      size: Number(buffer.readBigUInt64BE(offset + 8)),
    }
  }
  if (size === 0) {
    return { type, header: 8, size: remaining }
  }
  return { type, header: 8, size }
}

function* boxes(buffer: Buffer, start: number, end: number) {
  let offset = start
  while (offset + 8 <= end) {
    const box = boxHeader(buffer, offset, end - offset)
    if (box.size < box.header || offset + box.size > end) {
      throw new Error('The video file is damaged')
    }
    yield { type: box.type, start: offset + box.header, end: offset + box.size }
    offset += box.size
  }
}

function moovSize(moov: Buffer) {
  for (const track of boxes(moov, 0, moov.length)) {
    if (track.type !== 'trak') {
      continue
    }
    let size: { width: number; height: number } | null = null
    let video = false
    for (const child of boxes(moov, track.start, track.end)) {
      if (child.type === 'tkhd') {
        size = trackSize(moov, child.start)
      }
      if (child.type === 'mdia') {
        video = handlerType(moov, child.start, child.end) === 'vide'
      }
    }
    if (video && size !== null) {
      return size
    }
  }
  return null
}

function handlerType(moov: Buffer, start: number, end: number) {
  for (const child of boxes(moov, start, end)) {
    if (child.type === 'hdlr') {
      return moov.toString('latin1', child.start + 8, child.start + 12)
    }
  }
  return null
}

function trackSize(moov: Buffer, start: number) {
  const matrix = start + (moov.readUInt8(start) === 1 ? 52 : 40)
  const width = Math.round(moov.readUInt32BE(matrix + 36) / 65536)
  const height = Math.round(moov.readUInt32BE(matrix + 40) / 65536)
  if (width === 0 || height === 0) {
    return null
  }
  const turned =
    moov.readInt32BE(matrix) === 0 && moov.readInt32BE(matrix + 16) === 0
  return turned ? { width: height, height: width } : { width, height }
}

function webmSize(buffer: Buffer) {
  for (const top of elements(buffer, 0, buffer.length)) {
    if (top.id !== SEGMENT) {
      continue
    }
    for (const part of elements(buffer, top.start, top.end)) {
      if (part.id === CLUSTER) {
        return null
      }
      if (part.id !== TRACKS) {
        continue
      }
      for (const entry of elements(buffer, part.start, part.end)) {
        if (entry.id !== TRACK_ENTRY) {
          continue
        }
        for (const child of elements(buffer, entry.start, entry.end)) {
          if (child.id !== VIDEO) {
            continue
          }
          const fields = new Map<number, number>()
          for (const field of elements(buffer, child.start, child.end)) {
            fields.set(field.id, unsigned(buffer, field.start, field.end))
          }
          const width = fields.get(PIXEL_WIDTH)
          const height = fields.get(PIXEL_HEIGHT)
          if (
            width !== undefined &&
            height !== undefined &&
            width > 0 &&
            height > 0
          ) {
            return { width, height }
          }
        }
      }
      return null
    }
  }
  return null
}

function* elements(buffer: Buffer, start: number, end: number) {
  let offset = start
  while (offset < end) {
    const id = variableInteger(buffer, offset, true)
    const size = variableInteger(buffer, offset + id.length, false)
    const dataStart = offset + id.length + size.length
    const dataEnd = size.unknown ? end : Math.min(dataStart + size.value, end)
    yield { id: id.value, start: dataStart, end: dataEnd }
    offset = dataEnd
  }
}

function variableInteger(buffer: Buffer, offset: number, marker: boolean) {
  const first = buffer.at(offset)
  if (first === undefined || first === 0) {
    throw new Error('The video file is damaged')
  }
  const length = Math.clz32(first) - 23
  if (offset + length > buffer.length) {
    throw new Error('The video file is damaged')
  }
  let value = marker ? first : first & (0xff >> length)
  let unknown = value === 0xff >> length
  for (let index = 1; index < length; index++) {
    value = value * 256 + buffer[offset + index]
    unknown = unknown && buffer[offset + index] === 0xff
  }
  return { value, length, unknown: !marker && unknown }
}

function unsigned(buffer: Buffer, start: number, end: number) {
  let value = 0
  for (let index = start; index < end; index++) {
    value = value * 256 + buffer[index]
  }
  return value
}
