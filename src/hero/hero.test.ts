import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../canvas/renderCard', () => ({ renderCard: vi.fn() }))
vi.mock('../altText', () => ({ generateAltText: vi.fn(() => 'alt for card') }))

import { renderCard } from '../canvas/renderCard'
import { generateAltText } from '../altText'
import { HERO_CARDS, heroPosterUrl } from './heroCards'

const mockRender = vi.mocked(renderCard)
const mockFetch = vi.fn()

/**
 * hero.ts has no exports: it runs init() on import and is driven entirely
 * through the page. So each test builds the About page's slots, imports a
 * fresh copy of the module, and observes the DOM and the mocks.
 */
async function loadHero() {
  vi.resetModules()
  await import('./hero')
}

/** Let fetches, FileReader callbacks and the (stubbed) image loads settle. */
async function settle(rounds = 20) {
  for (let i = 0; i < rounds; i++) await new Promise(r => setTimeout(r, 0))
}

function buildPage(slots: string[] = HERO_CARDS.map(c => c.slot)) {
  document.body.innerHTML =
    slots.map(s => `<div data-hero-frame data-state="loading"><img data-hero-card="${s}"></div>`).join('') +
    '<button data-hero-shuffle>Shuffle the gradient</button>'
}

const img = (slot: string) => document.querySelector<HTMLImageElement>(`img[data-hero-card="${slot}"]`)!
const frameState = (slot: string) => img(slot).closest('[data-hero-frame]')!.getAttribute('data-state')
const shuffle = () => document.querySelector<HTMLButtonElement>('[data-hero-shuffle]')!.click()

const posterCount = HERO_CARDS.reduce((n, c) => n + c.films.length, 0)

let srcDescriptor: PropertyDescriptor | undefined
let blobCounter = 0

beforeEach(() => {
  vi.clearAllMocks()
  blobCounter = 0

  mockFetch.mockImplementation(async () => ({ ok: true, blob: async () => new Blob(['jpg'], { type: 'image/jpeg' }) }))
  vi.stubGlobal('fetch', mockFetch)
  mockRender.mockImplementation(async () => new Blob(['png'], { type: 'image/png' }))
  URL.createObjectURL = vi.fn(() => `blob:card-${++blobCounter}`)
  URL.revokeObjectURL = vi.fn()

  // jsdom never loads a blob: URL, so drawInto would wait on img.onload
  // forever. Fire it the way a browser would once the src is assigned.
  srcDescriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src')
  Object.defineProperty(HTMLImageElement.prototype, 'src', {
    configurable: true,
    get(this: HTMLImageElement) { return this.getAttribute('src') ?? '' },
    set(this: HTMLImageElement, value: string) {
      this.setAttribute('src', value)
      queueMicrotask(() => this.onload?.(new Event('load')))
    },
  })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  if (srcDescriptor) Object.defineProperty(HTMLImageElement.prototype, 'src', srcDescriptor)
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('hero', () => {
  it('draws every card slot on load with the real render options', async () => {
    buildPage()
    await loadHero()
    await settle()

    expect(mockRender).toHaveBeenCalledTimes(HERO_CARDS.length)
    for (const card of HERO_CARDS) {
      expect(img(card.slot).getAttribute('src')).toMatch(/^blob:card-\d+$/)
      expect(img(card.slot).alt).toBe('alt for card')
      expect(frameState(card.slot)).toBe('ready')
    }
    // Alt text is generated from the same options the card was drawn with.
    expect(vi.mocked(generateAltText).mock.calls.map(c => c[0])).toEqual(mockRender.mock.calls.map(c => c[0]))
  })

  it('fetches each poster as a data URL, anonymously, and hands them to the renderer', async () => {
    buildPage()
    await loadHero()
    await settle()

    expect(mockFetch).toHaveBeenCalledTimes(posterCount)
    const first = HERO_CARDS[0]
    expect(mockFetch).toHaveBeenCalledWith(
      heroPosterUrl(first.films[0]),
      { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' },
    )
    const drawn = mockRender.mock.calls.flatMap(c => c[0].films.map(f => f.posterDataUrl))
    expect(drawn).toHaveLength(posterCount)
    expect(drawn.every(u => u?.startsWith('data:image/jpeg'))).toBe(true)
  })

  it('degrades a failed poster to an empty slot instead of failing the card', async () => {
    const bad = heroPosterUrl(HERO_CARDS[0].films[0])
    mockFetch.mockImplementation(async (url: string) =>
      url === bad ? { ok: false, status: 404 } : { ok: true, blob: async () => new Blob(['jpg'], { type: 'image/jpeg' }) })
    buildPage()
    await loadHero()
    await settle()

    const films = mockRender.mock.calls.find(c => c[0].films.length === HERO_CARDS[0].films.length && c[0].films[0].posterDataUrl === '')
    expect(films).toBeDefined()
    expect(frameState(HERO_CARDS[0].slot)).toBe('ready')
  })

  it('reuses the fetched posters when shuffled, and redraws every card', async () => {
    buildPage()
    await loadHero()
    await settle()
    expect(mockFetch).toHaveBeenCalledTimes(posterCount)

    shuffle()
    await settle()
    expect(mockRender).toHaveBeenCalledTimes(HERO_CARDS.length * 2)
    expect(mockFetch).toHaveBeenCalledTimes(posterCount)
  })

  it('revokes the previous blob URL once the new image has loaded', async () => {
    buildPage()
    await loadHero()
    await settle()
    const before = HERO_CARDS.map(c => img(c.slot).getAttribute('src'))
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()

    shuffle()
    await settle()
    for (const url of before) expect(URL.revokeObjectURL).toHaveBeenCalledWith(url)
    for (const [i, c] of HERO_CARDS.entries()) expect(img(c.slot).getAttribute('src')).not.toBe(before[i])
  })

  it('ignores shuffle clicks while a draw is still in flight', async () => {
    let release!: () => void
    const gate = new Promise<void>(r => { release = r })
    mockRender.mockImplementation(async () => { await gate; return new Blob(['png'], { type: 'image/png' }) })
    buildPage()
    await loadHero()
    await settle()
    expect(mockRender).toHaveBeenCalledTimes(HERO_CARDS.length)

    shuffle()
    shuffle()
    shuffle()
    await settle()
    expect(mockRender).toHaveBeenCalledTimes(HERO_CARDS.length)

    release()
    await settle()
    // Once it finishes, the button works again.
    shuffle()
    await settle()
    expect(mockRender).toHaveBeenCalledTimes(HERO_CARDS.length * 2)
  })

  it('marks a frame failed, logs nothing identifying, and still draws the others', async () => {
    let calls = 0
    mockRender.mockImplementation(async () => {
      if (++calls === 1) throw new TypeError('secret film title')
      return new Blob(['png'], { type: 'image/png' })
    })
    buildPage()
    await loadHero()
    await settle()

    const states = HERO_CARDS.map(c => frameState(c.slot))
    expect(states.filter(s => s === 'failed')).toHaveLength(1)
    expect(states.filter(s => s === 'ready')).toHaveLength(HERO_CARDS.length - 1)
    // The page runs Faro, which captures console.warn: name only, never the message.
    expect(console.warn).toHaveBeenCalledWith('[hero] card render failed', 'TypeError')
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain('secret film title')
  })

  it('skips a slot the page does not have', async () => {
    buildPage([HERO_CARDS[0].slot])
    await loadHero()
    await settle()
    expect(mockRender).toHaveBeenCalledTimes(1)
    expect(frameState(HERO_CARDS[0].slot)).toBe('ready')
  })

  it('waits for DOMContentLoaded when imported while the document is still loading', async () => {
    buildPage()
    const readyState = vi.spyOn(document, 'readyState', 'get').mockReturnValue('loading')
    await loadHero()
    await settle()
    expect(mockRender).not.toHaveBeenCalled()

    readyState.mockReturnValue('interactive')
    document.dispatchEvent(new Event('DOMContentLoaded'))
    await settle()
    expect(mockRender).toHaveBeenCalledTimes(HERO_CARDS.length)
  })
})
