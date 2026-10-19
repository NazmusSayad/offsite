import { pathToFileURL } from 'node:url'
import type { Prompt } from '@offsite/core/items'
import { saveImage } from '../images.ts'
import { openCode } from './client.ts'

export async function sendPrompt(
  sessionId: string,
  cwd: string,
  prompt: Prompt
) {
  const client = await openCode()
  const sessionID = sessionId
  const location = { directory: cwd }
  const match = /^\/(\S+)\s*([\s\S]*)$/.exec(prompt.text)
  if (match !== null) {
    if (match[1] === 'compact' && prompt.images.length === 0) {
      await client.session.compact({ sessionID })
      return
    }
    const commands = await client.command.list({ location })
    if (commands.data.some((command) => command.name === match[1])) {
      await client.session.command({
        sessionID,
        name: match[1],
        text: match[2],
        files: await files(sessionID, prompt),
      })
      return
    }
    const skills = await client.skill.list({ location })
    const skill = skills.data.find((item) => item.name === match[1])
    if (skill !== undefined) {
      await client.session.prompt({
        sessionID,
        text: match[2],
        files: await files(sessionID, prompt),
        skills: [{ id: skill.id }],
      })
      return
    }
  }
  await client.session.prompt({
    sessionID,
    text: prompt.text,
    files: await files(sessionID, prompt),
  })
}

export function files(sessionId: string, prompt: Prompt) {
  return Promise.all(
    prompt.images.map(async (image) => ({
      uri: pathToFileURL(await saveImage(sessionId, image)).href,
    }))
  )
}
