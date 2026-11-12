import type { SessionSettings } from '@offsite/core/config'
import type { ImageAttachment } from '@offsite/core/items'
import { debounce } from 'es-toolkit'
import { createStore, del, get, set } from 'idb-keyval'
import { create } from 'zustand'
import {
  persist,
  type PersistStorage,
  type StorageValue,
} from 'zustand/middleware'

type Draft = {
  text: string
  images: (ImageAttachment & { number: number })[]
  files: { number: number; id: string; name: string }[]
  settings: SessionSettings | null
}
type Stash = Omit<Draft, 'settings'> & { id: string; createdAt: number }
type Drafts = { drafts: Record<string, Draft>; stash: Stash[] }

const storageKey = 'composerDrafts'
const empty: Draft = { text: '', images: [], files: [], settings: null }
const database = createStore('offsite-drafts', 'drafts')
const fileDatabase = createStore('offsite-draft-files', 'files')
const save = debounce(
  (value: StorageValue<Drafts>) => void set(storageKey, value, database),
  300
)

const storage: PersistStorage<Drafts> = {
  getItem: async (name) =>
    (await get<StorageValue<Drafts>>(name, database)) ?? null,
  setItem: (_name, value) => save(value),
  removeItem: (name) => del(name, database),
}

const initial: Drafts = { drafts: {}, stash: [] }

const useDrafts = create<Drafts>()(
  persist(() => initial, {
    name: storageKey,
    storage,
    skipHydration: true,
    version: 1,
    migrate: () => initial,
  })
)

window.addEventListener('pagehide', save.flush)

export function loadDrafts() {
  return useDrafts.persist.rehydrate()
}

export function useDraft(key: string) {
  return useDrafts((state) => state.drafts[key] ?? empty)
}

export function editDraft(key: string, change: (draft: Draft) => Draft) {
  const current = getDraft(key)
  const draft = change(current)
  const stash = useDrafts.getState().stash
  for (const file of current.files) {
    if (
      !draft.files.some((other) => other.id === file.id) &&
      !stash.some((item) => item.files.some((other) => other.id === file.id))
    ) {
      void del(file.id, fileDatabase)
    }
  }
  useDrafts.setState((state) => {
    const drafts = { ...state.drafts, [key]: draft }
    if (
      draft.text === '' &&
      draft.images.length === 0 &&
      draft.files.length === 0 &&
      draft.settings === null
    ) {
      delete drafts[key]
    }
    return { drafts }
  })
}

export async function saveDraftFile(file: File) {
  const id = crypto.randomUUID()
  await set(id, file, fileDatabase)
  return id
}

export async function loadDraftFile(id: string) {
  return await get<File>(id, fileDatabase)
}

export function moveDraft(from: string, to: string) {
  const draft = { ...getDraft(from), settings: getDraft(to).settings }
  useDrafts.setState((state) => {
    const drafts = { ...state.drafts, [to]: draft }
    delete drafts[from]
    return { drafts }
  })
}

export function deleteDraft(key: string) {
  editDraft(key, () => empty)
}

export function getDraft(key: string) {
  return useDrafts.getState().drafts[key] ?? empty
}

export function getDraftSettings(key: string) {
  return useDrafts.getState().drafts[key]?.settings ?? null
}

export function saveDraftSettings(
  key: string,
  settings: SessionSettings | null
) {
  editDraft(key, (current) => ({ ...current, settings }))
}

export function useStash() {
  return useDrafts((state) => state.stash)
}

export function getStash() {
  return useDrafts.getState().stash
}

export function fileMarker(file: { number: number; name: string }) {
  return `[File #${file.number}: ${file.name}]`
}

export function hasPrompt(draft: Omit<Draft, 'settings'>) {
  return draft.text.trim() !== ''
}

export function usedAttachments(draft: Omit<Draft, 'settings'>) {
  return {
    images: draft.images.filter((image) =>
      draft.text.includes(`[Image #${image.number}]`)
    ),
    files: draft.files.filter((file) => draft.text.includes(fileMarker(file))),
  }
}

export function stashDraft(key: string) {
  const draft = getDraft(key)
  useDrafts.setState((state) => ({
    stash: [
      {
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        text: draft.text,
        ...usedAttachments(draft),
      },
      ...state.stash,
    ],
  }))
  editDraft(key, (current) => ({ ...current, text: '', images: [], files: [] }))
}

export function restoreStash(key: string, id: string, lastImage: number) {
  const item = useDrafts.getState().stash.find((stashed) => stashed.id === id)
  if (item === undefined) {
    throw new Error('This stashed prompt no longer exists')
  }
  if (hasPrompt(getDraft(key))) {
    stashDraft(key)
  }
  useDrafts.setState((state) => ({
    stash: state.stash.filter((stashed) => stashed.id !== id),
  }))
  const text = item.text.replace(/\[Image #(\d+)\]/g, (marker, number) => {
    const index = item.images.findIndex(
      (image) => image.number === Number(number)
    )
    return index === -1 ? marker : `[Image #${lastImage + index + 1}]`
  })
  editDraft(key, (current) => ({
    ...current,
    text,
    images: item.images.map((image, index) => ({
      ...image,
      number: lastImage + index + 1,
    })),
    files: item.files,
  }))
  return text
}

export function deleteStash(id: string) {
  const item = useDrafts.getState().stash.find((stashed) => stashed.id === id)
  if (item === undefined) {
    return
  }
  useDrafts.setState((state) => ({
    stash: state.stash.filter((stashed) => stashed.id !== id),
  }))
  for (const file of item.files) {
    void del(file.id, fileDatabase)
  }
}
