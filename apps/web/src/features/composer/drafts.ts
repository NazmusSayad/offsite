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
  settings: SessionSettings | null
}
type Drafts = { drafts: Record<string, Draft> }

const storageKey = 'composerDrafts'
const empty: Draft = { text: '', images: [], settings: null }
const database = createStore('offsite-drafts', 'drafts')
const save = debounce(
  (value: StorageValue<Drafts>) => void set(storageKey, value, database),
  300
)

const storage: PersistStorage<Drafts> = {
  getItem: async (name) => {
    const stored = await get<StorageValue<Drafts>>(name, database)
    const legacy = localStorage.getItem(name)
    if (stored !== undefined) {
      localStorage.removeItem(name)
      return stored
    }
    if (legacy === null) {
      return null
    }
    const value: StorageValue<Drafts> = JSON.parse(legacy)
    await set(name, value, database)
    localStorage.removeItem(name)
    return value
  },
  setItem: (_name, value) => save(value),
  removeItem: (name) => del(name, database),
}

const useDrafts = create<Drafts>()(
  persist(() => ({ drafts: {} }), {
    name: storageKey,
    storage,
    skipHydration: true,
    version: 1,
    migrate: (persisted) => ({
      drafts: Object.fromEntries(
        Object.entries((persisted as Drafts).drafts).map((entry) => [
          entry[0],
          { ...entry[1], images: [] },
        ])
      ),
    }),
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
  useDrafts.setState((state) => {
    const draft = change(state.drafts[key] ?? empty)
    const drafts = { ...state.drafts, [key]: draft }
    if (
      draft.text === '' &&
      draft.images.length === 0 &&
      draft.settings === null
    ) {
      delete drafts[key]
    }
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
