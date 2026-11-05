import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { text } from '@oiper/desktop'
import { readConfig } from '../storage/config.ts'

export { ping, workflows } from '@oiper/desktop'

export async function transcribe(audio: Buffer) {
  const workflowId = readConfig().dictation.workflowId
  if (workflowId === null) {
    throw new Error('No OiPer workflow is chosen for dictation')
  }
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'offsite-dictation-'))
  try {
    const audioPath = path.join(dir, 'dictation')
    await fs.writeFile(audioPath, audio)
    return (await text({ audioPath, contentType: 'audio/wav', workflowId }))
      .text
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
}
