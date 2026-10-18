import { XIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { Item, Prompt } from '@offsite/core/items'
import { ViewableImage } from '@/components/viewable-image'
import { editDraft, useDraft } from './drafts'

export function AttachedImages(props: { draftKey: string }) {
  const images = useDraft(props.draftKey).images

  return (
    <div className="mb-3 flex flex-wrap gap-2 px-3 sm:px-4">
      {images.map((image) => (
        <div
          key={image.number}
          className="border-border/80 bg-background relative size-16 overflow-hidden rounded-lg border"
        >
          <ViewableImage
            src={`data:${image.mediaType};base64,${image.data}`}
            alt=""
            name={`Image #${image.number}`}
            className="block size-full"
            imageClassName="size-full object-cover"
          />
          <button
            className="absolute top-1 right-1 grid size-5 cursor-pointer place-items-center rounded-full bg-black/60 text-white"
            title="Remove image"
            onClick={() =>
              editDraft(props.draftKey, (current) => ({
                ...current,
                text: current.text.replace(
                  new RegExp(`\\[Image #${image.number}\\] ?`),
                  ''
                ),
                images: current.images.filter(
                  (other) => other.number !== image.number
                ),
              }))
            }
          >
            <HugeiconsIcon icon={XIcon} className="size-3" />
          </button>
        </div>
      ))}
    </div>
  )
}

export function lastImageNumber(items: Item[], texts: string[]) {
  let last = 0
  for (const text of [
    ...texts,
    ...items.flatMap((item) => {
      if (item.parent !== null) {
        return []
      }
      if (item.kind === 'user') {
        return [item.text]
      }
      if (item.kind === 'question' && item.answers !== null) {
        return Object.values(item.answers)
      }
      return []
    }),
  ]) {
    for (const match of text.matchAll(/\[Image #(\d+)\]/g)) {
      last = Math.max(last, Number(match[1]))
    }
  }
  return last
}

export function restoredDraft(prompt: Prompt) {
  const numbers = [
    ...new Set(
      [...prompt.text.matchAll(/\[Image #(\d+)\]/g)].map((match) =>
        Number(match[1])
      )
    ),
  ].sort((first, second) => first - second)
  if (numbers.length === prompt.images.length) {
    return {
      text: prompt.text,
      images: prompt.images.map((image, index) => ({
        ...image,
        number: numbers[index],
      })),
    }
  }
  const first = Math.max(0, ...numbers) + 1
  const images = prompt.images.map((image, index) => ({
    ...image,
    number: first + index,
  }))
  return {
    text: `${images.map((image) => `[Image #${image.number}] `).join('')}${prompt.text}`,
    images,
  }
}
