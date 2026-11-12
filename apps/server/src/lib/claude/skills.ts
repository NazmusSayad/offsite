import { randomUUID, type UUID } from 'node:crypto'
import type { Query, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import type { Prompt } from '@offsite/core/items'

const imageTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']

type ImageType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'

export type Input = {
  prompt: Prompt
  uuid: UUID
  priority: 'next' | undefined
}

export async function* skillInputs(
  query: Query,
  input: Input,
  silent: Set<string>
) {
  const skills = input.prompt.text.includes('/')
    ? (await query.supportedCommands())
        .filter((command) => command.builtin !== true)
        .map((command) => command.name)
    : []
  for (const message of toUserInputs(
    input.prompt,
    input.uuid,
    input.priority,
    skills
  )) {
    if (message.shouldQuery === false && message.uuid !== undefined) {
      silent.add(message.uuid)
    }
    yield message
  }
}

function toUserInputs(
  prompt: Prompt,
  uuid: UUID,
  priority: 'next' | undefined,
  skills: string[]
): SDKUserMessage[] {
  for (const image of prompt.images) {
    if (!imageTypes.includes(image.mediaType)) {
      throw new Error(`${image.mediaType} images are not supported`)
    }
  }
  const texts = stackedTexts(prompt.text, skills)
  const mentions = mentionedSkills(prompt.text, skills)
  const messages = texts.map((text, index) => {
    const last = index === texts.length - 1
    return {
      ...userInput(
        [
          ...(text === '' ? [] : [{ type: 'text' as const, text }]),
          ...(last
            ? prompt.images.map((image) => ({
                type: 'image' as const,
                source: {
                  type: 'base64' as const,
                  media_type: image.mediaType as ImageType,
                  data: image.data,
                },
              }))
            : []),
        ],
        last ? uuid : randomUUID(),
        priority
      ),
      ...(last && mentions.length === 0 ? {} : { shouldQuery: false }),
    }
  })
  if (mentions.length === 0) {
    return messages
  }
  return [
    ...messages,
    {
      ...userInput(
        mentions.map((name) => ({
          type: 'text' as const,
          text: `The user's message contains /${name}, which is the name of a skill. If they are asking you to run it, call the Skill tool with skill: "${name}", passing any arguments they gave as args. If they only mention it, do not run it.`,
        })),
        randomUUID(),
        priority
      ),
      isSynthetic: true,
    },
  ]
}

function userInput(
  content: Exclude<SDKUserMessage['message']['content'], string>,
  uuid: UUID,
  priority: 'next' | undefined
): SDKUserMessage {
  return {
    type: 'user',
    message: { role: 'user', content },
    parent_tool_use_id: null,
    uuid,
    ...(priority === undefined ? {} : { priority }),
  }
}

function stackedTexts(text: string, skills: string[]) {
  const names: string[] = []
  let rest = text.trimStart()
  while (names.length < 6) {
    const match = /^\/(\S+)(?:\s+|$)/.exec(rest)
    if (match === null || !skills.includes(match[1])) {
      break
    }
    names.push(match[1])
    rest = rest.slice(match[0].length)
  }
  if (names.length < 2) {
    return [text]
  }
  return names.map((name) => `/${name} ${rest}`.trimEnd())
}

function mentionedSkills(text: string, skills: string[]) {
  const names: string[] = []
  if (text.startsWith('/')) {
    return names
  }
  for (const match of text.matchAll(
    /(^|[\s。、？！])(\/[a-zA-Z][a-zA-Z0-9.:\-_]*)/g
  )) {
    const start = match.index + match[1].length
    const end = start + match[2].replace(/\.+$/, '').length
    if (
      (start !== 0 && !/\s/.test(text[start - 1])) ||
      (end !== text.length && !/\s/.test(text[end]))
    ) {
      continue
    }
    const name = text.slice(start + 1, end)
    if (skills.includes(name) && !names.includes(name)) {
      names.push(name)
    }
  }
  return names
}

export function stackedCommand(previous: string, next: string) {
  const match = /^\/\S+\s*([\s\S]*)$/.exec(next)
  if (match === null || !previous.endsWith(match[1])) {
    return null
  }
  const names = previous.slice(0, previous.length - match[1].length).trim()
  if (!/^\/\S+(\s+\/\S+)*$/.test(names)) {
    return null
  }
  return `${names} ${next}`
}
