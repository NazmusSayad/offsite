import type { Image, Settings } from '@server/protocol'
import { create } from 'zustand'
import {
  persist,
  type PersistStorage,
  type StorageValue,
} from 'zustand/middleware'
import { home, machineKey } from '@/machines'

type Draft = { text: string; images: Image[]; settings: Settings | null }
type Drafts = { drafts: Record<string, Draft> }

const storageKey = 'composerDrafts'
const empty: Draft = { text: '', images: [], settings: null }
let pending: StorageValue<Drafts> | null = null
let timer: number | undefined

const storage: PersistStorage<Drafts> = {
  getItem: (name) => {
    const raw = localStorage.getItem(name)
    if (raw === null) return null
    return JSON.parse(raw)
  },
  setItem: (_name, value) => {
    pending = value
    window.clearTimeout(timer)
    timer = window.setTimeout(flush, 300)
  },
  removeItem: (name) => localStorage.removeItem(name),
}

const useDrafts = create<Drafts>()(
  persist(() => ({ drafts: {} }), {
    name: storageKey,
    version: 3,
    storage,
    migrate: (state, version) => {
      if (version !== 2) return { drafts: {} }
      return {
        drafts: Object.fromEntries(
          Object.entries((state as Drafts).drafts).map((entry) => [
            machineKey(home, entry[0]),
            { ...entry[1], settings: null },
          ])
        ),
      }
    },
  })
)

window.addEventListener('pagehide', flush)

function flush() {
  window.clearTimeout(timer)
  if (pending === null) return
  const value = pending
  pending = null
  try {
    localStorage.setItem(storageKey, JSON.stringify(value))
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'QuotaExceededError'))
      throw error
    const drafts = Object.fromEntries(
      Object.entries(value.state.drafts)
        .filter((entry) => entry[1].text !== '' || entry[1].settings !== null)
        .map((entry) => [entry[0], { ...entry[1], images: [] }])
    )
    localStorage.setItem(
      storageKey,
      JSON.stringify({ state: { drafts }, version: value.version })
    )
  }
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
    )
      delete drafts[key]
    return { drafts }
  })
}

export function deleteDraft(key: string) {
  editDraft(key, () => empty)
}

export function getDraftSettings(key: string) {
  return useDrafts.getState().drafts[key]?.settings ?? null
}

export function saveDraftSettings(key: string, settings: Settings | null) {
  editDraft(key, (current) => ({ ...current, settings }))
}
