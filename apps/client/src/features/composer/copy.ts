import { toast } from 'sonner'
import { z } from 'zod'
import { getState } from '@/lib/store'
import { lastImageNumber } from './attached-images'
import {
  editDraft,
  fileMarker,
  getDraft,
  draftFileCopy,
  saveDraftFile,
  usedAttachments,
} from './drafts'

const copiedSchema = z.object({
  text: z.string(),
  images: z.array(
    z.object({ number: z.number(), mediaType: z.string(), data: z.string() })
  ),
  files: z.array(
    z.object({
      number: z.number(),
      name: z.string(),
      type: z.string(),
      data: z.string(),
    })
  ),
})

type CopiedPrompt = z.infer<typeof copiedSchema>

export function copyPrompt(event: ClipboardEvent, key: string, text: string) {
  const draft = getDraft(key)
  const used = usedAttachments({
    text,
    images: draft.images,
    files: draft.files,
  })
  if (
    event.clipboardData === null ||
    (used.images.length === 0 && used.files.length === 0)
  ) {
    return false
  }
  const files = []
  for (const file of used.files) {
    const copy = draftFileCopy(file.id)
    if (copy === undefined) {
      toast.warning(
        `${file.name} is still loading, so only its name was copied`
      )
      continue
    }
    if (copy === 'missing') {
      toast.warning(
        `${file.name} is no longer saved, so only its name was copied`
      )
      continue
    }
    if (copy === 'too large') {
      toast.warning(`${file.name} is over 10 MB, so only its name was copied`)
      continue
    }
    files.push({ number: file.number, name: file.name, ...copy })
  }
  const element = document.createElement('div')
  element.style.whiteSpace = 'pre-wrap'
  element.textContent = text
  element.dataset.offsitePrompt = JSON.stringify({
    text,
    images: used.images,
    files,
  })
  event.preventDefault()
  event.clipboardData.setData('text/plain', text)
  event.clipboardData.setData('text/html', element.outerHTML)
  return true
}

export function copiedPrompt(html: string) {
  if (!html.includes('data-offsite-prompt')) {
    return null
  }
  const value = new DOMParser()
    .parseFromString(html, 'text/html')
    .querySelector('[data-offsite-prompt]')
    ?.getAttribute('data-offsite-prompt')
  if (value === undefined || value === null) {
    return null
  }
  return copiedSchema.parse(JSON.parse(value))
}

export async function pastePrompt(
  key: string,
  copied: CopiedPrompt,
  insert: (text: string, markers: string[]) => void
) {
  const draft = getDraft(key)
  const firstImage =
    Math.max(
      lastImageNumber(getState().items, [draft.text]),
      ...draft.images.map((image) => image.number)
    ) + 1
  const firstFile = Math.max(0, ...draft.files.map((file) => file.number)) + 1
  const images = copied.images.map((image, index) => ({
    ...image,
    number: firstImage + index,
  }))
  const files = await Promise.all(
    copied.files.map(async (file, index) => ({
      number: firstFile + index,
      id: await saveDraftFile(
        new File([bytesOf(file.data)], file.name, { type: file.type })
      ),
      name: file.name,
    }))
  )
  const renamed = [
    ...copied.images.map((image, index) => ({
      from: `[Image #${image.number}]`,
      to: `[Image #${images[index].number}]`,
    })),
    ...copied.files.map((file, index) => ({
      from: fileMarker(file),
      to: fileMarker(files[index]),
    })),
  ]
  const text =
    renamed.length === 0
      ? copied.text
      : copied.text.replace(
          new RegExp(
            renamed
              .map((item) => item.from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
              .join('|'),
            'g'
          ),
          (marker) => {
            const item = renamed.find((other) => other.from === marker)
            if (item === undefined) {
              throw new Error(`Unknown attachment ${marker}`)
            }
            return item.to
          }
        )
  editDraft(key, (current) => ({
    ...current,
    images: [...current.images, ...images],
    files: [...current.files, ...files],
  }))
  insert(
    text,
    renamed.map((item) => item.to)
  )
}

function bytesOf(base64: string) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}
