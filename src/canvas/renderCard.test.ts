import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderCard, loadImage } from './renderCard'

// Auto-loading Image: fires onload immediately so renderCard doesn't hang in tests
class AutoImage {
  onload?: () => void
  onerror?: (err?: unknown) => void
  private _src = ''
  get src() { return this._src }
  set src(value: string) {
    this._src = value
    if (value) queueMicrotask(() => this.onload?.())
  }
}

const MOCK_OPTIONS = {
  films: [
    { title: 'Dune', year: '2021', rating: '★★★★', posterDataUrl: 'data:image/png;base64,abc' },
    { title: 'Arrival', year: '2016', rating: '★★★★★', posterDataUrl: 'data:image/png;base64,def' },
    { title: 'Blade Runner 2049', year: '2017', rating: '★★★★½', posterDataUrl: 'data:image/png;base64,ghi' },
    { title: 'Annihilation', year: '2018', rating: '★★★★', posterDataUrl: 'data:image/png;base64,jkl' },
  ],
  username: 'michaellamb',
  showTitle: true,
  showYear: true,
  showRating: true,
  showDate: true,
}

describe('renderCard', () => {
  beforeEach(() => { vi.stubGlobal('Image', AutoImage as unknown as typeof Image) })
  afterEach(() => { vi.unstubAllGlobals() })

  it('resolves to a Blob', async () => {
    const blob = await renderCard(MOCK_OPTIONS)
    expect(blob).toBeInstanceOf(Blob)
  })

  it('returns a PNG blob', async () => {
    const blob = await renderCard(MOCK_OPTIONS)
    expect(blob.type).toBe('image/png')
  })

  it('resolves with all options disabled', async () => {
    const blob = await renderCard({
      ...MOCK_OPTIONS,
      showTitle: false,
      showYear: false,
      showRating: false,
      showDate: false,
    })
    expect(blob).toBeInstanceOf(Blob)
  })
})

describe('loadImage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function makeMockImageClass() {
    let captured: { onload?: () => void; onerror?: (err?: unknown) => void; src?: string } | null = null
    class MockImage {
      onload?: () => void
      onerror?: (err?: unknown) => void
      src?: string
      constructor() { captured = this as unknown as typeof captured }
    }
    return { MockImage, getCapture: () => captured }
  }

  it('resolves when the image loads', async () => {
    const { MockImage, getCapture } = makeMockImageClass()
    vi.stubGlobal('Image', MockImage as unknown as typeof Image)

    const promise = loadImage('data:image/png;base64,abc')
    getCapture()!.onload?.()

    const result = await promise
    expect(result).toBe(getCapture())
  })

  it('rejects when the image errors', async () => {
    const { MockImage, getCapture } = makeMockImageClass()
    vi.stubGlobal('Image', MockImage as unknown as typeof Image)

    const promise = loadImage('data:image/png;base64,INVALID')
    getCapture()!.onerror?.(new Event('error'))

    await expect(promise).rejects.toBeInstanceOf(Event)
  })
})
