import { toCanvas } from 'html-to-image'
import { saveBlob } from '@/lib/media'

export const imageFormats = [
  { label: 'PNG', type: 'image/png', extension: 'png' },
  { label: 'WebP', type: 'image/webp', extension: 'webp' },
  { label: 'JPEG', type: 'image/jpeg', extension: 'jpg' },
]

export async function elementImage(element: HTMLElement | null, type: string) {
  if (element === null) {
    throw new Error('Nothing to export')
  }
  const canvas = await toCanvas(element, {
    pixelRatio: 2,
    backgroundColor: getComputedStyle(document.body).backgroundColor,
  })
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, type)
  )
  if (blob === null || blob.type !== type) {
    throw new Error(`This browser cannot create ${type} images`)
  }
  return blob
}

export async function downloadImage(
  element: HTMLElement | null,
  format: (typeof imageFormats)[number],
  name: string
) {
  saveBlob(
    await elementImage(element, format.type),
    `${name}.${format.extension}`
  )
}
