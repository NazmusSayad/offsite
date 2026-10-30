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
type Drafts = { drafts: Record<string, Draft> }

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

const useDrafts = create<Drafts>()(
  persist(() => ({ drafts: {} }), {
    name: storageKey,
    storage,
    skipHydration: true,
    version: 1,
    migrate: () => ({ drafts: {} }),
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
  for (const file of current.files) {
    if (!draft.files.some((other) => other.id === file.id)) {
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
