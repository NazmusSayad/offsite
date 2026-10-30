import { useState } from 'react'
import { showError } from '@/lib/store'

export function useCopy() {
  const [copied, setCopied] = useState(false)

  async function write(task: () => Promise<void>) {
    try {
      if (!window.isSecureContext) {
        throw new Error('Copying needs https or localhost')
      }
      await task()
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (error) {
      showError(error)
    }
  }

  return {
    copied,
    copy: (text: string) => write(() => navigator.clipboard.writeText(text)),
    copyImage: (image: Promise<Blob>) =>
      write(() =>
        navigator.clipboard.write([new ClipboardItem({ 'image/png': image })])
      ),
  }
}
