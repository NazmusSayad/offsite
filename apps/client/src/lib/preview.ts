import { useEffect, useState } from 'react'
import { errorMessage } from '@/lib/utils'

export type Preview =
  | { kind: 'text'; text: string }
  | { kind: 'image' | 'video' | 'audio'; src: string }

export const TEXT_READ_LIMIT = 1024 * 1024

export function usePreview(load: () => Promise<Preview>) {
  const [first] = useState(() => load)
  const [preview, setPreview] = useState<
    Preview | { kind: 'error'; message: string } | null
  >(null)

  useEffect(() => {
    let current = true
    first().then(
      (loaded) => {
        if (current) {
          setPreview(loaded)
        }
      },
      (caught: unknown) => {
        if (current) {
          setPreview({ kind: 'error', message: errorMessage(caught) })
        }
      }
    )
    return () => {
      current = false
    }
  }, [first])

  return preview
}
