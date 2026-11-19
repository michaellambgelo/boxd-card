import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

// Network and canvas are other suites' business. URL parsing, settings storage
// and the member helpers stay real.
vi.mock('../canvas/renderCard', () => ({
  renderCard: vi.fn(async () => new Blob(['png'], { type: 'image/png' })),
  measureReviewFit: vi.fn(async () => null),
  measureGridFit: vi.fn(() => null),
}))
vi.mock('./faro', () => ({
  track: vi.fn(),
  startAction: vi.fn(() => ({ end: vi.fn() })),
}))
vi.mock('./handoff', () => ({ getHandoffUrl: vi.fn(() => '') }))
vi.mock('./webScraper', async importOriginal => {
  const actual = await importOriginal<typeof import('./webScraper')>()
  return {
    ...actual,
    scrapeLetterboxdPage: vi.fn(),
    fetchImageDataUrl: vi.fn(),
    resolveLetterboxdUrl: vi.fn(),
    fetchPageDocument: vi.fn(),
  }
})
vi.mock('./member', async importOriginal => {
  const actual = await importOriginal<typeof import('./member')>()
  return { ...actual, lookupMember: vi.fn(), refreshMember: vi.fn() }
})

import App from './App'
import { renderCard, measureReviewFit, measureGridFit } from '../canvas/renderCard'
import { track } from './faro'
import { getHandoffUrl } from './handoff'
import { fetchImageDataUrl, scrapeLetterboxdPage } from './webScraper'
import { MEMBER_STALE_MS, MemberLookupError, lookupMember, refreshMember } from './member'
import { loadRememberedUser, loadSettings, saveRememberedUser, saveSettings, type RememberedUser } from '../storage/settings'
import type { FilmDataResponse } from '../content/index'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mockScrape    = vi.mocked(scrapeLetterboxdPage)
const mockImage     = vi.mocked(fetchImageDataUrl)
const mockRender    = vi.mocked(renderCard)
const mockLookup    = vi.mocked(lookupMember)
const mockRefresh   = vi.mocked(refreshMember)
const mockHandoff   = vi.mocked(getHandoffUrl)

const AVATAR = 'data:image/jpeg;base64,AVATAR'

function filmData(username: string, extra: Partial<FilmDataResponse> = {}): FilmDataResponse {
  return {
    username,
    films: [
      { title: 'Dune', year: '2021', rating: '★★★★', date: '', posterUrl: 'https://a.ltrbxd.com/p.jpg', filmId: '1' },
    ] as FilmDataResponse['films'],
    authorAvatarUrl: `https://a.ltrbxd.com/resized/avatar/upload/${username}/avtr-0-80-0-80-crop.jpg`,
    ...extra,
  }
}

type Nav = { share?: unknown; canShare?: unknown }
const nav = navigator as unknown as Nav

let container: HTMLDivElement
let root: Root
let share: ReturnType<typeof vi.fn<(data: { files: File[] }) => Promise<void>>>

async function settle(rounds = 8) {
  for (let i = 0; i < rounds; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 0)) })
  }
}
const q = <T extends Element = HTMLElement>(sel: string) => container.querySelector<T>(sel)
const action = (name: string) => q<HTMLButtonElement>(`[data-faro-user-action-name="${name}"]`)
function button(label: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button'))
    .find(b => b.textContent?.trim() === label || b.getAttribute('aria-label') === label)
}
function checkbox(label: string): HTMLInputElement | undefined {
  const l = Array.from(container.querySelectorAll('label')).find(el => el.textContent?.trim() === label)
  return l?.querySelector('input') ?? undefined
}
function cardActions(): string[] {
  return ['card-download', 'card-copy', 'card-share'].filter(n => action(n)).map(n => n.replace('card-', ''))
}
async function click(el: Element | null | undefined) {
  expect(el).toBeTruthy()
  await act(async () => { (el as HTMLElement).click() })
  await settle(2)
}
/** Set a controlled input the way a keystroke does, so React's onChange fires. */
async function type(input: HTMLInputElement | null, value: string) {
  expect(input).toBeTruthy()
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input!.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function enableShare(canShareFiles = true) {
  share = vi.fn<(data: { files: File[] }) => Promise<void>>().mockResolvedValue(undefined)
  nav.share = share
  nav.canShare = vi.fn(() => canShareFiles)
}

async function mount() {
  await act(async () => { root.render(<App />) })
  await settle()
}

/** Mounts with a ?url= hand-off, which auto-generates once settings load. */
async function mountAndGenerate(url: string, data: FilmDataResponse) {
  mockHandoff.mockReturnValue(url)
  mockScrape.mockResolvedValue(data)
  await mount()
  await settle()
  expect(q('img[alt="Boxd Card preview"]')).not.toBeNull()
}

const usernameInput = () => q<HTMLInputElement>('input[aria-label="Your Letterboxd username"]')
const urlInput = () => q<HTMLInputElement>('#lbUrl')
const generateButton = () => button('Generate Card')

beforeEach(() => {
  localStorage.clear()
  delete nav.share
  delete nav.canShare
  vi.clearAllMocks()
  mockHandoff.mockReturnValue('')
  mockImage.mockResolvedValue('data:image/jpeg;base64,POSTER')
  mockRefresh.mockImplementation(async saved => saved)
  URL.createObjectURL = vi.fn(() => 'blob:card')
  URL.revokeObjectURL = vi.fn()

  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

// ── Card buttons (hiddenAction) ───────────────────────────────────────────────

describe('App action row', () => {
  it('offers Share only where the browser can share files', async () => {
    await mountAndGenerate('https://letterboxd.com/ada/', filmData('ada'))
    expect(cardActions()).toEqual(['download', 'copy'])
  })

  it('hides Share when navigator.share exists but file sharing is refused', async () => {
    enableShare(false)
    await mountAndGenerate('https://letterboxd.com/ada/', filmData('ada'))
    expect(cardActions()).toEqual(['download', 'copy'])
  })

  it('shows all three by default when sharing is available', async () => {
    enableShare()
    await mountAndGenerate('https://letterboxd.com/ada/', filmData('ada'))
    expect(cardActions()).toEqual(['download', 'copy', 'share'])
  })

  it('removes Download when hiddenAction is download and Share can replace it', async () => {
    enableShare()
    await saveSettings({ hiddenAction: 'download' })
    await mountAndGenerate('https://letterboxd.com/ada/', filmData('ada'))
    expect(cardActions()).toEqual(['copy', 'share'])
  })

  it('keeps Download when hiddenAction is download but the browser cannot share', async () => {
    await saveSettings({ hiddenAction: 'download' })
    await mountAndGenerate('https://letterboxd.com/ada/', filmData('ada'))
    expect(cardActions()).toEqual(['download', 'copy'])
  })

  it('removes Share when hiddenAction is share', async () => {
    enableShare()
    await saveSettings({ hiddenAction: 'share' })
    await mountAndGenerate('https://letterboxd.com/ada/', filmData('ada'))
    expect(cardActions()).toEqual(['download', 'copy'])
  })

  it('shares the PNG as a file and records the event', async () => {
    enableShare()
    await mountAndGenerate('https://letterboxd.com/ada/', filmData('ada'))
    await click(action('card-share'))
    const [file] = share.mock.calls[0][0].files
    expect(file.name).toBe('boxd-card.png')
    expect(file.type).toBe('image/png')
    expect(track).toHaveBeenCalledWith('card_shared', expect.any(Object))
  })

  it('treats a dismissed share sheet as a cancel: no error, no event', async () => {
    enableShare()
    share.mockRejectedValue(Object.assign(new Error('Share canceled'), { name: 'AbortError' }))
    await mountAndGenerate('https://letterboxd.com/ada/', filmData('ada'))
    await click(action('card-share'))
    expect(container.textContent).not.toContain('Sharing is not available')
    expect(track).not.toHaveBeenCalledWith('card_shared', expect.any(Object))
  })

  it('reports any other share failure', async () => {
    enableShare()
    share.mockRejectedValue(Object.assign(new Error('nope'), { name: 'NotAllowedError' }))
    await mountAndGenerate('https://letterboxd.com/ada/', filmData('ada'))
    await click(action('card-share'))
    expect(container.textContent).toContain('Sharing is not available here. Try Download instead.')
    expect(track).not.toHaveBeenCalledWith('card_shared', expect.any(Object))
  })
})

describe('App Card buttons setting', () => {
  it('is not offered where the browser cannot share files', async () => {
    await mount()
    await click(action('open-settings'))
    expect(checkbox('Remove Download button')).toBeUndefined()
    expect(checkbox('Remove Share button')).toBeUndefined()
  })

  it('ticking one box clears the other and persists a single value', async () => {
    enableShare()
    await mount()
    await click(action('open-settings'))
    expect(checkbox('Remove Download button')?.checked).toBe(false)
    expect(checkbox('Remove Share button')?.checked).toBe(false)

    await click(checkbox('Remove Download button'))
    expect(checkbox('Remove Download button')?.checked).toBe(true)
    expect(checkbox('Remove Share button')?.checked).toBe(false)
    expect((await loadSettings()).hiddenAction).toBe('download')

    await click(checkbox('Remove Share button'))
    expect(checkbox('Remove Download button')?.checked).toBe(false)
    expect(checkbox('Remove Share button')?.checked).toBe(true)
    expect((await loadSettings()).hiddenAction).toBe('share')

    await click(checkbox('Remove Share button'))
    expect(checkbox('Remove Share button')?.checked).toBe(false)
    expect((await loadSettings()).hiddenAction).toBe('none')
  })

  it('reflects a saved choice on load', async () => {
    enableShare()
    await saveSettings({ hiddenAction: 'share' })
    await mount()
    await click(action('open-settings'))
    expect(checkbox('Remove Share button')?.checked).toBe(true)
    expect(checkbox('Remove Download button')?.checked).toBe(false)
  })
})

// ── Remembered member ────────────────────────────────────────────────────────

describe('App member button', () => {
  const fresh = (extra: Partial<RememberedUser> = {}): RememberedUser =>
    ({ username: 'ada', at: Date.now(), ...extra })

  it('with nothing remembered, opens Settings and focuses the username field', async () => {
    await mount()
    const setup = action('member-setup')
    expect(setup?.getAttribute('aria-label')).toBe('Remember my Letterboxd username')
    expect(setup?.querySelector('svg')?.getAttribute('stroke')).toBe('currentColor')
    expect(action('member-menu')).toBeNull()

    await click(setup)
    expect(usernameInput()).not.toBeNull()
    expect(document.activeElement).toBe(usernameInput())
  })

  it('shows the saved avatar when the member has one', async () => {
    await saveRememberedUser(fresh({ avatarDataUrl: AVATAR }))
    await mount()
    expect(action('member-menu')?.querySelector('img')?.getAttribute('src')).toBe(AVATAR)
    expect(action('member-menu')?.querySelector('svg')).toBeNull()
  })

  it('shows the gradient member icon when the member has no picture', async () => {
    await saveRememberedUser(fresh())
    await mount()
    const btn = action('member-menu')
    expect(btn?.querySelector('img')).toBeNull()
    expect(btn?.querySelector('svg')?.getAttribute('stroke')).toBe('url(#bc-member-grad)')
  })

  it('never puts the username in the button\'s accessible name or action name', async () => {
    await saveRememberedUser(fresh({ username: 'secretname', avatarDataUrl: AVATAR }))
    await mount()
    const btn = action('member-menu')!
    expect(btn.getAttribute('aria-label')).not.toContain('secretname')
    expect(btn.outerHTML).not.toContain('secretname')
    await click(btn)
    expect(q('[role="menu"]')!.outerHTML).not.toContain('secretname')
  })

  it.each([
    ['profile', 'https://letterboxd.com/ada/'],
    ['diary',   'https://letterboxd.com/ada/diary/'],
    ['reviews', 'https://letterboxd.com/ada/reviews/'],
  ])('menu → %s fills the URL field and enables Generate', async (id, url) => {
    await saveRememberedUser(fresh())
    await mount()
    expect(generateButton()?.disabled).toBe(true)

    await click(action('member-menu'))
    expect(Array.from(container.querySelectorAll('[role="menuitem"]')).map(b => b.textContent)).toEqual(['Profile', 'Diary', 'Reviews'])

    await click(action(`member-page-${id}`))
    expect(urlInput()?.value).toBe(url)
    expect(q('[role="menu"]')).toBeNull()
    expect(generateButton()?.disabled).toBe(false)
  })

  it('closes the menu on Escape and on a press outside it', async () => {
    await saveRememberedUser(fresh())
    await mount()

    await click(action('member-menu'))
    expect(q('[role="menu"]')).not.toBeNull()
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })) })
    expect(q('[role="menu"]')).toBeNull()

    await click(action('member-menu'))
    expect(q('[role="menu"]')).not.toBeNull()
    await act(async () => { document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })) })
    expect(q('[role="menu"]')).toBeNull()
  })
})

describe('App member settings', () => {
  async function openMemberSettings() {
    await mount()
    await click(action('member-setup'))
  }

  it('saves a looked-up member and shows them', async () => {
    mockLookup.mockResolvedValue({ username: 'Ada', at: 5, avatarDataUrl: AVATAR })
    await openMemberSettings()
    await type(usernameInput(), '@ada')
    await click(action('member-save'))

    expect(mockLookup).toHaveBeenCalledWith('ada')
    expect(await loadRememberedUser()).toEqual({ username: 'Ada', at: 5, avatarDataUrl: AVATAR })
    expect(container.textContent).toContain('@Ada')
    expect(usernameInput()).toBeNull()
    expect(action('member-forget')).not.toBeNull()
  })

  it('rejects input that cannot be a username without calling Letterboxd', async () => {
    await openMemberSettings()
    await type(usernameInput(), 'two words')
    await click(action('member-save'))
    expect(mockLookup).not.toHaveBeenCalled()
    expect(q('[role="alert"]')?.textContent).toMatch(/Enter your Letterboxd username/)
    expect(await loadRememberedUser()).toBeNull()
  })

  it('shows the lookup\'s message and saves nothing when the member does not exist', async () => {
    mockLookup.mockRejectedValue(new MemberLookupError("Letterboxd doesn't have a member with that username."))
    await openMemberSettings()
    await type(usernameInput(), 'nosuchuser')
    await click(action('member-save'))
    expect(q('[role="alert"]')?.textContent).toBe("Letterboxd doesn't have a member with that username.")
    expect(await loadRememberedUser()).toBeNull()
    expect(usernameInput()).not.toBeNull()
  })

  it('never surfaces an unexpected error\'s own text', async () => {
    mockLookup.mockRejectedValue(new Error('boom at letterboxd.com/nosuchuser/'))
    await openMemberSettings()
    await type(usernameInput(), 'nosuchuser')
    await click(action('member-save'))
    expect(q('[role="alert"]')?.textContent).toBe('Could not save that username. Try again.')
  })

  it('Forget clears storage and returns the header to the setup button', async () => {
    await saveRememberedUser({ username: 'ada', at: Date.now(), avatarDataUrl: AVATAR })
    await mount()
    await click(action('open-settings'))
    await click(action('member-forget'))
    expect(await loadRememberedUser()).toBeNull()
    expect(usernameInput()).not.toBeNull()
    await click(action('close-settings'))
    expect(action('member-setup')).not.toBeNull()
    expect(action('member-menu')).toBeNull()
  })
})

describe('App member refresh', () => {
  const stale = (): RememberedUser => ({ username: 'ada', at: Date.now() - MEMBER_STALE_MS - 1000 })

  it('leaves a fresh member alone', async () => {
    await saveRememberedUser({ username: 'ada', at: Date.now() })
    await mount()
    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it('refreshes a stale member and stores the result', async () => {
    const saved = stale()
    await saveRememberedUser(saved)
    mockRefresh.mockResolvedValue({ username: 'ada', at: 99, avatarDataUrl: AVATAR })
    await mount()
    expect(mockRefresh).toHaveBeenCalledWith(saved)
    expect(await loadRememberedUser()).toEqual({ username: 'ada', at: 99, avatarDataUrl: AVATAR })
    expect(action('member-menu')?.querySelector('img')?.getAttribute('src')).toBe(AVATAR)
  })

  it('does not resurrect a member forgotten while the refresh was in flight', async () => {
    await saveRememberedUser({ ...stale(), avatarDataUrl: AVATAR })
    let finish!: (u: RememberedUser) => void
    mockRefresh.mockReturnValue(new Promise<RememberedUser>(r => { finish = r }))
    await mount()

    await click(action('open-settings'))
    await click(action('member-forget'))
    expect(await loadRememberedUser()).toBeNull()

    await act(async () => { finish({ username: 'ada', at: 99, avatarDataUrl: AVATAR }) })
    await settle()
    expect(await loadRememberedUser()).toBeNull()
    expect(action('member-forget')).toBeNull()
  })
})

describe('App card footer identity', () => {
  const lastRenderOptions = () => mockRender.mock.calls[mockRender.mock.calls.length - 1][0]

  it('with nobody remembered, every card is someone else\'s: share icon, page avatar', async () => {
    await mountAndGenerate('https://letterboxd.com/ada/', filmData('ada'))
    expect(lastRenderOptions().showShareIcon).toBe(true)
    expect(mockImage).toHaveBeenCalledWith(expect.stringContaining('/avatar/'))
  })

  it('on the remembered member\'s own page, drops the share icon and uses the saved avatar', async () => {
    await saveRememberedUser({ username: 'Ada', at: Date.now(), avatarDataUrl: AVATAR })
    await mountAndGenerate('https://letterboxd.com/ada/', filmData('ada'))
    const options = lastRenderOptions()
    expect(options.showShareIcon).toBe(false)
    expect(options.footerAvatarDataUrl).toBe(AVATAR)
    // The saved copy is used as-is: no avatar fetch for the footer.
    expect(mockImage).not.toHaveBeenCalledWith(expect.stringContaining('/avatar/'))
  })

  it('on their own page with no saved picture, falls back to the page\'s avatar', async () => {
    await saveRememberedUser({ username: 'ada', at: Date.now() })
    await mountAndGenerate('https://letterboxd.com/ada/', filmData('ada'))
    expect(lastRenderOptions().showShareIcon).toBe(false)
    expect(mockImage).toHaveBeenCalledWith(expect.stringContaining('/avatar/'))
  })

  it('on another member\'s page, keeps the share icon and never uses the saved avatar', async () => {
    await saveRememberedUser({ username: 'ada', at: Date.now(), avatarDataUrl: AVATAR })
    await mountAndGenerate('https://letterboxd.com/bob/', filmData('bob'))
    const options = lastRenderOptions()
    expect(options.showShareIcon).toBe(true)
    expect(options.footerAvatarDataUrl).not.toBe(AVATAR)
    expect(options.username).toBe('bob')
  })
})

// ── Review fit notice ────────────────────────────────────────────────────────

describe('App grid fit notice', () => {
  const TEXT_OFF = {
    layout: '4:5' as const, filmCount: 20,
    hiddenFields: ['title' as const, 'year' as const, 'date' as const],
    fittingLayouts: ['landscape' as const, 'story' as const],
  }
  const notice = () => container.querySelector('[role="status"]')

  it('says nothing when the text is on the card', async () => {
    await mountAndGenerate('https://letterboxd.com/ada/', filmData('ada'))
    expect(notice()).toBeNull()
  })

  it('says which fields a dense card left off and offers the layouts that keep them', async () => {
    vi.mocked(measureGridFit).mockReturnValueOnce(TEXT_OFF)
    await mountAndGenerate('https://letterboxd.com/ada/', filmData('ada'))
    expect(notice()?.textContent).toContain('Titles, years and dates are left off.')
    expect(notice()?.textContent).toContain('20 films only fit on 4:5 as posters.')
    const labels = Array.from(notice()!.querySelectorAll('button')).map(b => b.textContent?.trim())
    expect(labels).toEqual(['Use Landscape', 'Use Story'])
  })

  it('"Use <layout>" saves the layout and regenerates with it', async () => {
    vi.mocked(measureGridFit).mockReturnValueOnce(TEXT_OFF)
    await mountAndGenerate('https://letterboxd.com/ada/', filmData('ada'))
    await click(button('Use Story'))
    await settle()
    expect(vi.mocked(renderCard).mock.lastCall?.[0].layout).toBe('story')
    expect((await loadSettings()).layout).toBe('story')
    expect(notice()).toBeNull()
  })
})

describe('App review fit notice', () => {
  const LEFT_OUT = {
    layout: 'banner' as const, requested: 4, shown: 2, clipped: false,
    fittingLayouts: ['landscape' as const, 'story' as const], hideableFields: ['tags' as const],
  }
  const notice = () => container.querySelector('[role="status"]')

  it('says nothing when every review is on the card', async () => {
    await mountAndGenerate('https://letterboxd.com/ada/', filmData('ada'))
    expect(notice()).toBeNull()
  })

  it('says how many reviews were left out and offers only changes, no "show fewer"', async () => {
    vi.mocked(measureReviewFit).mockResolvedValueOnce(LEFT_OUT)
    await mountAndGenerate('https://letterboxd.com/ada/', filmData('ada'))
    expect(notice()?.textContent).toContain('Showing 2 of 4 reviews.')
    expect(notice()?.textContent).toContain('The other 2 don\u2019t fit on Banner.')
    const labels = Array.from(notice()!.querySelectorAll('button')).map(b => b.textContent?.trim())
    expect(labels).toEqual(['Use Landscape', 'Use Story', 'Hide tags'])
  })

  it('"Use <layout>" saves the layout and regenerates with it', async () => {
    vi.mocked(measureReviewFit).mockResolvedValueOnce(LEFT_OUT)
    await mountAndGenerate('https://letterboxd.com/ada/', filmData('ada'))
    await click(button('Use Story'))
    await settle()
    expect(vi.mocked(renderCard).mock.lastCall?.[0].layout).toBe('story')
    expect((await loadSettings()).layout).toBe('story')
    expect(notice()).toBeNull()
  })

  it('"Hide <field>" saves the setting and regenerates without the field', async () => {
    vi.mocked(measureReviewFit).mockResolvedValueOnce(LEFT_OUT)
    await mountAndGenerate('https://letterboxd.com/ada/', filmData('ada'))
    const before = vi.mocked(renderCard).mock.calls.length
    await click(button('Hide tags'))
    await settle()
    expect(vi.mocked(renderCard).mock.calls.length).toBe(before + 1)
    expect((await loadSettings()).showTags).toBe(false)
    expect(notice()).toBeNull()
  })

  it('on a review card, hiding a field reaches the renderer and alt text lists only the reviews drawn', async () => {
    const review = (title: string) =>
      ({ title, year: '2021', rating: '★★★★', date: '', posterUrl: 'https://a.ltrbxd.com/p.jpg', filmId: title, reviewText: `${title} review`, tags: ['rewatch'] })
    await saveSettings({ reviewCount: 4, generateAltText: true, previewAltText: true })
    vi.mocked(measureReviewFit).mockResolvedValueOnce(LEFT_OUT)
    await mountAndGenerate('https://letterboxd.com/ada/reviews/', filmData('ada', {
      films: ['Dune', 'Arrival', 'Sicario', 'Enemy'].map(review) as FilmDataResponse['films'],
    }))
    expect(mockRender.mock.lastCall?.[0]).toMatchObject({ cardType: 'review', reviewCount: 4, showTags: true })

    // LEFT_OUT.shown is 2: the alt text must not describe the two reviews left out.
    const alt = q<HTMLTextAreaElement>('textarea')!.value
    expect(alt).toContain('Dune')
    expect(alt).toContain('Arrival')
    expect(alt).not.toContain('Sicario')
    expect(alt).not.toContain('Enemy')

    await click(button('Hide tags'))
    await settle()
    expect(mockRender.mock.lastCall?.[0]).toMatchObject({ cardType: 'review', showTags: false })
  })
})
