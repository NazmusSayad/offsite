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
import { errorMessage } from '@/lib/utils'
import { Row, Section } from './controls'

export function DictationPage(props: { machine: string; config: Config }) {
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
          setError(errorMessage(reason))
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
            value={props.config.dictation.workflowId ?? ''}
            onValueChange={(workflowId) =>
              void updateConfig(props.machine, {
                ...props.config,
                dictation: { ...props.config.dictation, workflowId },
              })
            }
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
