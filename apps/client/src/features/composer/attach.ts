import { readBase64, UPLOAD_LIMIT } from '@/api/upload'
import { getState, showError } from '@/lib/store'
import { lastImageNumber } from './attached-images'
import { moveComposerCaret } from './composer-input'
import { editDraft, fileMarker, getDraft, saveDraftFile } from './drafts'

const imageTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
const maxImageSize = 5 * 1024 * 1024

export async function attachFiles(
  key: string,
  list: File[],
  caret: number,
  onCaret: (position: number) => void
) {
  let position = caret
  let space = /(^|\s)$/.test(getDraft(key).text.slice(0, caret)) ? '' : ' '
  for (const file of list) {
    if (imageTypes.includes(file.type) && file.size <= maxImageSize) {
      const data = await readBase64(file)
      const number =
        Math.max(
          lastImageNumber(getState().items, [getDraft(key).text]),
          ...getDraft(key).images.map((image) => image.number)
        ) + 1
      const image = { number, mediaType: file.type, data }
      const at = position
      const marker = `${space}[Image #${number}] `
      space = ''
      editDraft(key, (current) => ({
        ...current,
        text: `${current.text.slice(0, at)}${marker}${current.text.slice(at)}`,
        images: [...current.images, image],
      }))
      position += marker.length
      onCaret(position)
      requestAnimationFrame(() => moveComposerCaret(position, false))
      continue
    }
    if (file.size > UPLOAD_LIMIT) {
      showError(new Error(`${file.name} is larger than 50 MB`))
      continue
    }
    const id = await saveDraftFile(file)
    const number =
      Math.max(0, ...getDraft(key).files.map((item) => item.number)) + 1
    const attached = { number, id, name: file.name }
    const at = position
    const marker = `${space}${fileMarker(attached)} `
    space = ''
    editDraft(key, (current) => ({
      ...current,
      text: `${current.text.slice(0, at)}${marker}${current.text.slice(at)}`,
      files: [...current.files, attached],
    }))
    position += marker.length
    onCaret(position)
    requestAnimationFrame(() => moveComposerCaret(position, false))
  }
}
