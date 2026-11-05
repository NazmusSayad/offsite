import { type Config, dictationEnvNames } from '@offsite/core/config'
import { useEffect, useState } from 'react'
import { call } from '@/api/connection'
import { updateConfig } from '@/api/machine-config'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { showError } from '@/lib/store'
import { Row, Section, TextInput } from './controls'

const providers = [
  { id: 'openai', label: 'OpenAI' },
  { id: 'groq', label: 'Groq' },
  { id: 'elevenlabs', label: 'ElevenLabs' },
  { id: 'deepgram', label: 'Deepgram' },
] as const

const keySources = [
  { id: 'env', label: 'Environment variable' },
  { id: 'keychain', label: 'Keychain' },
] as const

export function DictationPage(props: { machine: string; config: Config }) {
  const dictation = props.config.dictation
  const provider = dictation.provider
  const keySource = dictation.keySource
  const [found, setFound] = useState<boolean | null>(null)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let mounted = true
    setFound(null)
    call(props.machine, 'dictation.hasKey', { provider, keySource }).then(
      (value) => {
        if (mounted) {
          setFound(value)
        }
      },
      showError
    )
    return () => {
      mounted = false
    }
  }, [props.machine, provider, keySource, revision])

  async function saveKey(key: string) {
    try {
      await call(props.machine, 'dictation.saveKey', { provider, key })
    } catch (error) {
      showError(error)
    }
    setRevision(revision + 1)
  }

  return (
    <Section
      title="Dictation"
      note="This machine sends your recordings to the provider"
    >
      <Row label="Provider">
        <Select
          value={provider}
          onValueChange={(value) => {
            const next = providers.find((item) => item.id === value)
            if (next === undefined) {
              throw new Error(`Unknown dictation provider ${value}`)
            }
            void updateConfig(props.machine, {
              ...props.config,
              dictation: { ...dictation, provider: next.id },
            })
          }}
        >
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {providers.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>
      <Row label="API key from">
        <Select
          value={keySource}
          onValueChange={(value) => {
            const next = keySources.find((item) => item.id === value)
            if (next === undefined) {
              throw new Error(`Unknown dictation key source ${value}`)
            }
            void updateConfig(props.machine, {
              ...props.config,
              dictation: { ...dictation, keySource: next.id },
            })
          }}
        >
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {keySources.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>
      {keySource === 'env' && (
        <Row
          label={
            <>
              <code>{dictationEnvNames[provider]}</code>
              <span className="text-muted-foreground block text-xs font-normal">
                Read from the environment OffSite was started in
              </span>
            </>
          }
        >
          <span className="text-muted-foreground text-xs">
            {found === null ? 'Checking…' : found ? 'Found' : 'Not set'}
          </span>
        </Row>
      )}
      {keySource === 'keychain' && (
        <Row label="API key">
          <div className="flex items-center gap-2">
            <TextInput
              key={`${provider} ${revision}`}
              type="password"
              placeholder={
                found === null
                  ? 'Checking…'
                  : found
                    ? 'Saved, paste to replace'
                    : 'Paste your API key'
              }
              value=""
              onCommit={(text) => void saveKey(text.trim())}
            />
            {found === true && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void saveKey('')}
              >
                Remove
              </Button>
            )}
          </div>
        </Row>
      )}
    </Section>
  )
}
