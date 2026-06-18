import type { ListCount, ReviewCount, Layout, StatsCategory, StatsSubCategory } from '../types'

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
  generateAltText: boolean
  previewAltText: boolean
  letterboxdPro: boolean
  statsCategory: StatsCategory
  statsSubCategory: StatsSubCategory
  useTmdb: boolean
  extensionUseTmdb: boolean
  showDirector: boolean
  showRuntime: boolean
  showGenres: boolean
  showOverview: boolean
  /**
   * Cache the logged-in Letterboxd username + avatar (extension only).
   * When the popup is opened on a non-Letterboxd tab, the cached username
   * personalizes the "navigate to ..." nudge into a clickable deep link.
   * Web-app users see this setting but it's force-disabled (the web app
   * has no active-tab concept).
   */
  rememberUsername: boolean
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
  generateAltText: false,
  previewAltText: false,
  letterboxdPro: false,
  statsCategory: 'most-watched',
  statsSubCategory: 'most-watched',
  useTmdb: true,
  extensionUseTmdb: false,
  showDirector: false,
  showRuntime: false,
  showGenres: false,
  showOverview: false,
  rememberUsername: true,  // on by default — quiet, local-only convenience
}

const STORAGE_KEY = 'boxd-card-settings'
const REMEMBERED_USER_KEY = 'boxd-card-remembered-user'

/**
 * Cached identity for the "open my Letterboxd from any tab" affordance.
 * Kept separate from UserSettings because its lifecycle is different (it's
 * a derived cache refreshed on each successful Letterboxd visit), and
 * because the extension stores it in chrome.storage.local rather than
 * chrome.storage.sync (per-device cache, not user preference).
 */
export interface RememberedUser {
  username: string
  avatarUrl?: string
  at: number          // ms epoch of last refresh
}

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

// --- Remembered Letterboxd user (extension-only cache) -------------------
//
// chrome.storage.local (not .sync) — per-device cache, refreshed each time
// the popup detects a logged-in user on Letterboxd. Web-app builds fall
// through to localStorage so unit tests work, but the web app intentionally
// doesn't call save/load (the feature has no useful surface there).

function hasChromeLocalStorage(): boolean {
  return typeof chrome !== 'undefined' && !!chrome?.storage?.local
}

export async function loadRememberedUser(): Promise<RememberedUser | null> {
  if (hasChromeLocalStorage()) {
    const result = await chrome.storage.local.get(REMEMBERED_USER_KEY)
    const v = result[REMEMBERED_USER_KEY]
    return isRememberedUser(v) ? v : null
  }
  try {
    const raw = localStorage.getItem(REMEMBERED_USER_KEY)
    if (raw) {
      const v = JSON.parse(raw)
      return isRememberedUser(v) ? v : null
    }
  } catch { /* malformed JSON — treat as no cache */ }
  return null
}

export async function saveRememberedUser(user: RememberedUser): Promise<void> {
  if (hasChromeLocalStorage()) {
    await chrome.storage.local.set({ [REMEMBERED_USER_KEY]: user })
    return
  }
  localStorage.setItem(REMEMBERED_USER_KEY, JSON.stringify(user))
}

export async function clearRememberedUser(): Promise<void> {
  if (hasChromeLocalStorage()) {
    await chrome.storage.local.remove(REMEMBERED_USER_KEY)
    return
  }
  localStorage.removeItem(REMEMBERED_USER_KEY)
}

function isRememberedUser(v: unknown): v is RememberedUser {
  return !!v && typeof v === 'object'
    && typeof (v as RememberedUser).username === 'string'
    && (v as RememberedUser).username.length > 0
    && typeof (v as RememberedUser).at === 'number'
}
