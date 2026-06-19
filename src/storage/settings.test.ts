import { describe, it, expect, beforeEach } from 'vitest'
import {
  DEFAULT_SETTINGS,
  loadSettings, saveSettings,
  loadRememberedUser, saveRememberedUser, clearRememberedUser,
  type RememberedUser,
} from './settings'

// The chrome.storage shim in test/setup.ts deliberately omits the storage
// surface, so all these helpers fall through to localStorage — same shape
// as the web app. vitest's jsdom defaults to an opaque origin (no
// localStorage), so we install an in-memory shim per test.

const memoryStorage = (() => {
  const map = new Map<string, string>()
  return {
    getItem(k: string) { return map.has(k) ? map.get(k)! : null },
    setItem(k: string, v: string) { map.set(k, String(v)) },
    removeItem(k: string) { map.delete(k) },
    clear() { map.clear() },
    key(i: number) { return Array.from(map.keys())[i] ?? null },
    get length() { return map.size },
  } as Storage
})()

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: memoryStorage, configurable: true, writable: true,
  })
  memoryStorage.clear()
})

describe('UserSettings', () => {
  it('defaults rememberUsername to true (extension feature, opt-out)', () => {
    expect(DEFAULT_SETTINGS.rememberUsername).toBe(true)
  })

  it('loadSettings returns defaults on empty storage', async () => {
    const s = await loadSettings()
    expect(s).toEqual(DEFAULT_SETTINGS)
  })

  it('round-trips rememberUsername via saveSettings + loadSettings', async () => {
    await saveSettings({ rememberUsername: false })
    expect((await loadSettings()).rememberUsername).toBe(false)
    await saveSettings({ rememberUsername: true })
    expect((await loadSettings()).rememberUsername).toBe(true)
  })
})

describe('RememberedUser cache (extension chrome.storage.local; localStorage in tests)', () => {
  it('returns null when nothing is stored', async () => {
    expect(await loadRememberedUser()).toBeNull()
  })

  it('round-trips username + avatar + timestamp', async () => {
    const u: RememberedUser = {
      username: 'jsyd',
      avatarUrl: 'https://a.ltrbxd.com/resized/avatar/upload/.../jsyd.jpg',
      at: 1717000000000,
    }
    await saveRememberedUser(u)
    expect(await loadRememberedUser()).toEqual(u)
  })

  it('clearRememberedUser removes the cached entry', async () => {
    await saveRememberedUser({ username: 'tmp', at: 1 })
    expect(await loadRememberedUser()).not.toBeNull()
    await clearRememberedUser()
    expect(await loadRememberedUser()).toBeNull()
  })

  it('rejects malformed stored payloads (missing username or wrong shape)', async () => {
    // Empty username → invalid.
    localStorage.setItem('boxd-card-remembered-user', JSON.stringify({ username: '', at: 1 }))
    expect(await loadRememberedUser()).toBeNull()
    // Missing at → invalid.
    localStorage.setItem('boxd-card-remembered-user', JSON.stringify({ username: 'a' }))
    expect(await loadRememberedUser()).toBeNull()
    // Non-object → invalid.
    localStorage.setItem('boxd-card-remembered-user', JSON.stringify('jsyd'))
    expect(await loadRememberedUser()).toBeNull()
    // Malformed JSON → null without throwing.
    localStorage.setItem('boxd-card-remembered-user', '{not-json')
    expect(await loadRememberedUser()).toBeNull()
  })

  it('avatarUrl is optional (username-only is a valid cache)', async () => {
    await saveRememberedUser({ username: 'noavatar', at: 2 })
    const loaded = await loadRememberedUser()
    expect(loaded?.username).toBe('noavatar')
    expect(loaded?.avatarUrl).toBeUndefined()
  })
})
