import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { type ContentType, text } from '@oiper/desktop'
import { readConfig } from '../storage/config.ts'

export { ping, workflows } from '@oiper/desktop'

const contentTypes: Record<string, ContentType> = {
  'audio/wav': 'audio/wav',
  'audio/mpeg': 'audio/mpeg',
  'audio/mp4': 'audio/mp4',
  'audio/aac': 'audio/aac',
  'audio/flac': 'audio/flac',
  'audio/ogg': 'audio/ogg',
}

export async function transcribe(audio: Buffer, mediaType: string) {
  const workflowId = readConfig().dictation.workflowId
  if (workflowId === null) {
    throw new Error('No OiPer workflow is chosen for dictation')
  }
  const contentType = contentTypes[mediaType.split(';')[0].trim()]
  if (contentType === undefined) {
    throw new Error(`OiPer cannot transcribe ${mediaType} recordings`)
  }
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'offsite-dictation-'))
  try {
    const audioPath = path.join(dir, 'dictation')
    await fs.writeFile(audioPath, audio)
    return (await text({ audioPath, contentType, workflowId })).text
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
}
