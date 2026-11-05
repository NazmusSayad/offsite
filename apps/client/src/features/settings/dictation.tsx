import type { Config } from '@offsite/core/config'
import { useEffect, useState } from 'react'
import { call } from '@/api/connection'
import { updateConfig } from '@/api/machine-config'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Row, Section } from './controls'

export function DictationPage(props: { machine: string; config: Config }) {
  const dictation = props.config.dictation
  const [workflows, setWorkflows] = useState<
    { id: string; name: string }[] | null
  >(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    setWorkflows(null)
    setError(null)
    call(props.machine, 'dictation.workflows', undefined).then(
      (value) => {
        if (mounted) {
          setWorkflows(value)
        }
      },
      (reason: unknown) => {
        if (mounted) {
          setError(reason instanceof Error ? reason.message : String(reason))
        }
      }
    )
    return () => {
      mounted = false
    }
  }, [props.machine])

  return (
    <Section
      title="Dictation"
      note="This machine transcribes your recordings with the OiPer app"
    >
      <Row label="OiPer workflow">
        {error !== null ? (
          <span className="text-muted-foreground text-xs">{error}</span>
        ) : workflows === null ? (
          <span className="text-muted-foreground text-xs">Checking…</span>
        ) : (
          <Select
            value={dictation.workflowId ?? ''}
            onValueChange={(value) => {
              const next = workflows.find((item) => item.id === value)
              if (next === undefined) {
                throw new Error(`Unknown OiPer workflow ${value}`)
              }
              void updateConfig(props.machine, {
                ...props.config,
                dictation: { ...dictation, workflowId: next.id },
              })
            }}
          >
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Choose a workflow" />
            </SelectTrigger>
            <SelectContent>
              {workflows.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Row>
    </Section>
  )
}
