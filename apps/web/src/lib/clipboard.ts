import { useState } from 'react'
import { showError } from '@/store'

export function useCopy() {
  const [copied, setCopied] = useState(false)

  async function copy(text: string) {
    try {
      if (!window.isSecureContext)
        throw new Error('Copying needs https or localhost')
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (error) {
      showError(error)
    }
  }

  return { copied, copy }
}
