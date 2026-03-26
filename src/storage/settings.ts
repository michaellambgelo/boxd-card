import type { ListCount, ReviewCount, Layout } from '../types'

export interface UserSettings {
  listCount: ListCount
  reviewCount: ReviewCount
  showTitle: boolean
  showYear: boolean
  showRating: boolean
  showDate: boolean
  showListTitle: boolean
  showListDesc: boolean
  showCardTypeLabel: boolean
  showTags: boolean
  showBackdrop: boolean
  layout: Layout
}

export const DEFAULT_SETTINGS: UserSettings = {
  listCount: 4,
  reviewCount: 1,
  showTitle: true,
  showYear: true,
  showRating: true,
  showDate: true,
  showListTitle: true,
  showListDesc: true,
  showCardTypeLabel: true,
  showTags: true,
  showBackdrop: true,
  layout: 'landscape',
}

const STORAGE_KEY = 'boxd-card-settings'

function hasChromeStorage(): boolean {
  return typeof chrome !== 'undefined' && !!chrome?.storage?.sync
}

export async function loadSettings(): Promise<UserSettings> {
  if (hasChromeStorage()) {
    const result = await chrome.storage.sync.get(STORAGE_KEY)
    return { ...DEFAULT_SETTINGS, ...(result[STORAGE_KEY] ?? {}) }
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch { /* malformed JSON — fall through to defaults */ }
  return { ...DEFAULT_SETTINGS }
}

export async function saveSettings(partial: Partial<UserSettings>): Promise<void> {
  const current = await loadSettings()
  const updated = { ...current, ...partial }
  if (hasChromeStorage()) {
    await chrome.storage.sync.set({ [STORAGE_KEY]: updated })
    return
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
}
