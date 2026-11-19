import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

// The renderer has its own suite; here it only has to hand back a PNG blob.
vi.mock('../canvas/renderCard', () => ({
  renderCard: vi.fn(async () => new Blob(['png'], { type: 'image/png' })),
  measureReviewFit: vi.fn(async () => null),
}))

import Popup from './Popup'
import { renderCard, measureReviewFit } from '../canvas/renderCard'
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../storage/settings'
import type { FilmDataResponse } from '../content/index'

// No testing-library in this repo; react-dom + act under jsdom is enough.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const PROFILE_URL = 'https://letterboxd.com/ada/'

const FILM_DATA: FilmDataResponse = {
  username: 'ada',
  films: [
    { title: 'Dune', year: '2021', rating: '★★★★', date: '', posterUrl: 'https://a.ltrbxd.com/resized/film-poster/dune-0-70-0-105-crop.jpg', filmId: '1' },
  ] as FilmDataResponse['films'],
}

type Nav = { share?: unknown; canShare?: unknown }
const nav = navigator as unknown as Nav

let container: HTMLDivElement
let root: Root
let share: ReturnType<typeof vi.fn<(data: { files: File[] }) => Promise<void>>>

/** Let pending promises (settings load, tab query, generation) settle inside act. */
async function settle(rounds = 8) {
  for (let i = 0; i < rounds; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 0)) })
  }
}

function buttons(): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll('button'))
}
function button(label: string): HTMLButtonElement | undefined {
  return buttons().find(b => b.textContent?.trim() === label || b.getAttribute('aria-label') === label)
}
function checkbox(label: string): HTMLInputElement | undefined {
  const l = Array.from(container.querySelectorAll('label')).find(el => el.textContent?.trim() === label)
  return l?.querySelector('input') ?? undefined
}
/** The buttons under the card preview, in order. */
function actionLabels(): string[] {
  return ['Download', 'Copy', 'Share', 'Alt Text'].filter(l => button(l))
}
async function click(el: Element | undefined) {
  expect(el).toBeDefined()
  await act(async () => { (el as HTMLElement).click() })
  await settle(2)
}

function enableShare(canShareFiles = true) {
  share = vi.fn<(data: { files: File[] }) => Promise<void>>().mockResolvedValue(undefined)
  nav.share = share
  nav.canShare = vi.fn(() => canShareFiles)
}

async function mount() {
  await act(async () => { root.render(<Popup />) })
  await settle()
}

async function generate() {
  await click(button('Generate Card'))
  await settle()
  expect(container.querySelector('img[alt="Boxd Card preview"]')).not.toBeNull()
}

beforeEach(() => {
  localStorage.clear()
  delete nav.share
  delete nav.canShare

  const c = chrome as unknown as {
    runtime: Record<string, unknown>
    tabs: Record<string, unknown>
    scripting?: Record<string, unknown>
  }
  c.runtime.getManifest = () => ({ version: '9.9.9' })
  c.runtime.sendMessage = vi.fn(async (msg: { type: string }) =>
    msg.type === 'FETCH_IMAGE' ? { dataUrl: 'data:image/jpeg;base64,AAAA' } : { data: null })
  c.tabs.query = vi.fn(async () => [{ id: 1, url: PROFILE_URL }])
  c.tabs.sendMessage = vi.fn(async () => FILM_DATA)
  c.scripting = { executeScript: vi.fn(async () => [{ result: null }]) }

  // The update-banner check; irrelevant here, and must not hit the network.
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })))
  URL.createObjectURL = vi.fn(() => 'blob:card')
  URL.revokeObjectURL = vi.fn()
  vi.mocked(renderCard).mockClear()

  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

describe('Popup action row', () => {
  it('offers Share only where the browser can share files', async () => {
    await mount()
    await generate()
    expect(actionLabels()).toEqual(['Download', 'Copy'])
  })

  it('hides Share when navigator.share exists but file sharing is refused', async () => {
    enableShare(false)
    await mount()
    await generate()
    expect(actionLabels()).toEqual(['Download', 'Copy'])
  })

  it('shows Download, Copy and Share by default when sharing is available', async () => {
    enableShare()
    await mount()
    await generate()
    expect(actionLabels()).toEqual(['Download', 'Copy', 'Share'])
  })

  it('removes Download when hiddenAction is download and Share can replace it', async () => {
    enableShare()
    await saveSettings({ hiddenAction: 'download' })
    await mount()
    await generate()
    expect(actionLabels()).toEqual(['Copy', 'Share'])
  })

  it('keeps Download when hiddenAction is download but the browser cannot share', async () => {
    // Settings sync across devices: the choice can arrive on a machine with no
    // Share to fall back on, and must not leave Copy as the only way out.
    await saveSettings({ hiddenAction: 'download' })
    await mount()
    await generate()
    expect(actionLabels()).toEqual(['Download', 'Copy'])
  })

  it('removes Share when hiddenAction is share', async () => {
    enableShare()
    await saveSettings({ hiddenAction: 'share' })
    await mount()
    await generate()
    expect(actionLabels()).toEqual(['Download', 'Copy'])
  })
})

describe('Popup share', () => {
  function errorText(): string[] {
    return Array.from(container.querySelectorAll('p')).map(p => p.textContent ?? '').filter(t => /not available|could not/i.test(t))
  }

  it('hands the card PNG to navigator.share as a file', async () => {
    enableShare()
    await mount()
    await generate()
    await click(button('Share'))
    expect(share).toHaveBeenCalledTimes(1)
    const [file] = share.mock.calls[0][0].files
    expect(file).toBeInstanceOf(File)
    expect(file.name).toBe('boxd-card.png')
    expect(file.type).toBe('image/png')
    expect(errorText()).toEqual([])
  })

  it('treats a dismissed share sheet as a cancel, not an error', async () => {
    enableShare()
    share.mockRejectedValue(Object.assign(new Error('Share canceled'), { name: 'AbortError' }))
    await mount()
    await generate()
    await click(button('Share'))
    expect(errorText()).toEqual([])
    expect(button('Report this error')).toBeUndefined()
  })

  it('reports any other share failure and offers to report it', async () => {
    enableShare()
    share.mockRejectedValue(Object.assign(new Error('nope'), { name: 'NotAllowedError' }))
    await mount()
    await generate()
    await click(button('Share'))
    expect(errorText()).toEqual(['Sharing is not available here. Try Download instead.'])
    expect(button('Report this error')).toBeDefined()
    // The card survives the failure.
    expect(container.querySelector('img[alt="Boxd Card preview"]')).not.toBeNull()
  })
})

describe('Popup Card buttons setting', () => {
  async function openSettings() {
    await click(button('Settings'))
  }

  it('is not offered where the browser cannot share files', async () => {
    await mount()
    await openSettings()
    expect(checkbox('Remove Download button')).toBeUndefined()
    expect(checkbox('Remove Share button')).toBeUndefined()
  })

  it('starts with neither box ticked', async () => {
    enableShare()
    await mount()
    await openSettings()
    expect(checkbox('Remove Download button')?.checked).toBe(false)
    expect(checkbox('Remove Share button')?.checked).toBe(false)
    expect(DEFAULT_SETTINGS.hiddenAction).toBe('none')
  })

  it('ticking one box clears the other and persists a single value', async () => {
    enableShare()
    await mount()
    await openSettings()

    await click(checkbox('Remove Download button'))
    expect(checkbox('Remove Download button')?.checked).toBe(true)
    expect(checkbox('Remove Share button')?.checked).toBe(false)
    expect((await loadSettings()).hiddenAction).toBe('download')

    await click(checkbox('Remove Share button'))
    expect(checkbox('Remove Download button')?.checked).toBe(false)
    expect(checkbox('Remove Share button')?.checked).toBe(true)
    expect((await loadSettings()).hiddenAction).toBe('share')

    await click(checkbox('Remove Share button'))
    expect(checkbox('Remove Download button')?.checked).toBe(false)
    expect(checkbox('Remove Share button')?.checked).toBe(false)
    expect((await loadSettings()).hiddenAction).toBe('none')
  })

  it('reflects a saved choice when the popup reopens', async () => {
    enableShare()
    await saveSettings({ hiddenAction: 'share' })
    await mount()
    await openSettings()
    expect(checkbox('Remove Share button')?.checked).toBe(true)
    expect(checkbox('Remove Download button')?.checked).toBe(false)
  })
})

// ── Review fit notice ────────────────────────────────────────────────────────

describe('Popup review fit notice', () => {
  const LEFT_OUT = {
    layout: 'banner' as const, requested: 4, shown: 2, clipped: false,
    fittingLayouts: ['landscape' as const, 'story' as const], hideableFields: ['tags' as const],
  }
  const notice = () => container.querySelector('[role="status"]')

  it('says nothing when every review is on the card', async () => {
    await mount()
    await generate()
    expect(notice()).toBeNull()
  })

  it('says how many reviews were left out and offers only changes, no "show fewer"', async () => {
    vi.mocked(measureReviewFit).mockResolvedValueOnce(LEFT_OUT)
    await mount()
    await generate()
    expect(notice()?.textContent).toContain('Showing 2 of 4 reviews.')
    expect(notice()?.textContent).toContain('The other 2 don\u2019t fit on Banner.')
    const labels = Array.from(notice()!.querySelectorAll('button')).map(b => b.textContent?.trim())
    expect(labels).toEqual(['Use Landscape', 'Use Story', 'Hide tags'])
  })

  it('"Use <layout>" saves the layout and regenerates with it', async () => {
    vi.mocked(measureReviewFit).mockResolvedValueOnce(LEFT_OUT)
    await mount()
    await generate()
    await click(button('Use Story'))
    await settle()
    expect(vi.mocked(renderCard).mock.lastCall?.[0].layout).toBe('story')
    expect((await loadSettings()).layout).toBe('story')
    expect(notice()).toBeNull()
  })

  it('"Hide <field>" saves the setting and regenerates without the field', async () => {
    vi.mocked(measureReviewFit).mockResolvedValueOnce(LEFT_OUT)
    await mount()
    await generate()
    const before = vi.mocked(renderCard).mock.calls.length
    await click(button('Hide tags'))
    await settle()
    expect(vi.mocked(renderCard).mock.calls.length).toBe(before + 1)
    expect((await loadSettings()).showTags).toBe(false)
    expect(notice()).toBeNull()
  })
})
