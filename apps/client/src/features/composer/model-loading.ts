import type { Model, Provider } from '@offsite/core/providers'
import {
  type Dispatch,
  type SetStateAction,
  useEffect,
  useEffectEvent,
  useState,
} from 'react'
import { call } from '@/api/connection'
import { logger } from '@/lib/log'
import { useStore } from '@/lib/store'

const log = logger.withTag('composer')

export function useModelLoading(
  choices: {
    key: string
    provider: Provider
    accountId: string | null
    error: string | null
  }[],
  current: string | null,
  onFetched: Dispatch<SetStateAction<Record<string, Model[]>>>
) {
  const selection = useStore((state) => state.selection)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const loadModels = useEffectEvent(() => {
    if (selection === null) {
      return
    }
    for (const item of choices) {
      if (item.key === current || item.error !== null) {
        continue
      }
      call(selection.machine, 'capabilities', {
        provider: item.provider,
        accountId: item.accountId,
        projectId: selection.projectId,
      }).then(
        (result) =>
          onFetched((models) => ({ ...models, [item.key]: result.models })),
        (error: unknown) => {
          log.error('could not load models', error)
          setErrors((errors) => ({
            ...errors,
            [item.key]:
              error instanceof Error ? error.message : 'Could not load models',
          }))
        }
      )
    }
  })
  useEffect(() => {
    loadModels()
  }, [])
  return errors
}
