import { AsyncEntry } from '@napi-rs/keyring'
import {
  type DictationKeySource,
  type DictationProvider,
  dictationEnvNames,
} from '@offsite/core/config'
import { z } from 'zod'
import { readConfig } from '../storage/config.ts'

const textSchema = z.object({ text: z.string() })

const deepgramSchema = z.object({
  results: z.object({
    channels: z.array(
      z.object({ alternatives: z.array(z.object({ transcript: z.string() })) })
    ),
  }),
})

export async function transcribe(audio: Buffer, mediaType: string) {
  const dictation = readConfig().dictation
  const provider = dictation.provider
  const key = await readKey(provider, dictation.keySource)
  if (key === null) {
    throw new Error(
      dictation.keySource === 'env'
        ? `${dictationEnvNames[provider]} is not set in the environment offsite runs in`
        : `No ${provider} API key is saved in the keychain`
    )
  }
  const blob = new Blob([new Uint8Array(audio)], { type: mediaType })
  if (provider === 'deepgram') {
    const response = await fetch(
      'https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true',
      {
        method: 'POST',
        headers: { Authorization: `Token ${key}`, 'Content-Type': mediaType },
        body: blob,
      }
    )
    const result = deepgramSchema.parse(await readJson(response, 'Deepgram'))
    return result.results.channels[0].alternatives[0].transcript
  }
  const form = new FormData()
  form.append('file', blob, `dictation.${extensionOf(mediaType)}`)
  if (provider === 'elevenlabs') {
    form.append('model_id', 'scribe_v2')
    form.append('tag_audio_events', 'false')
    const response = await fetch(
      'https://api.elevenlabs.io/v1/speech-to-text',
      {
        method: 'POST',
        headers: { 'xi-api-key': key },
        body: form,
      }
    )
    return textSchema.parse(await readJson(response, 'ElevenLabs')).text
  }
  if (provider === 'openai') {
    form.append('model', 'gpt-4o-transcribe')
    const response = await fetch(
      'https://api.openai.com/v1/audio/transcriptions',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}` },
        body: form,
      }
    )
    return textSchema.parse(await readJson(response, 'OpenAI')).text
  }
  if (provider === 'groq') {
    form.append('model', 'whisper-large-v3-turbo')
    const response = await fetch(
      'https://api.groq.com/openai/v1/audio/transcriptions',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}` },
        body: form,
      }
    )
    return textSchema.parse(await readJson(response, 'Groq')).text
  }
  throw new Error(`Unknown dictation provider ${String(provider)}`)
}

export async function hasKey(
  provider: DictationProvider,
  keySource: DictationKeySource
) {
  return (await readKey(provider, keySource)) !== null
}

export async function saveKey(provider: DictationProvider, key: string) {
  const entry = keychainEntry(provider)
  if (key === '') {
    await entry.deletePassword()
    return null
  }
  await entry.setPassword(key)
  return null
}

async function readKey(
  provider: DictationProvider,
  keySource: DictationKeySource
) {
  if (keySource === 'env') {
    const value = process.env[dictationEnvNames[provider]]
    return value === undefined || value === '' ? null : value
  }
  if (keySource === 'keychain') {
    return await keychainEntry(provider).getPassword()
  }
  throw new Error(`Unknown dictation key source ${String(keySource)}`)
}

function keychainEntry(provider: DictationProvider) {
  return new AsyncEntry('offsite', `dictation-${provider}`)
}

async function readJson(response: Response, label: string): Promise<unknown> {
  if (!response.ok) {
    throw new Error(
      `${label} could not transcribe (${response.status}): ${await response.text()}`
    )
  }
  return await response.json()
}

function extensionOf(mediaType: string) {
  if (mediaType.startsWith('audio/webm')) {
    return 'webm'
  }
  if (mediaType.startsWith('audio/mp4')) {
    return 'mp4'
  }
  if (mediaType.startsWith('audio/ogg')) {
    return 'ogg'
  }
  throw new Error(`Unsupported recording format ${mediaType}`)
}
