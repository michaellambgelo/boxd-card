import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderCard, loadImage, computeLayout } from './renderCard'

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
  cardType: 'last-four-watched' as const,
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

  it('renders a 10-film list card', async () => {
    const films = Array.from({ length: 10 }, (_, i) => ({
      title: `Film ${i}`, year: '2024', rating: '★★★',
      posterDataUrl: 'data:image/png;base64,abc',
    }))
    const blob = await renderCard({
      films,
      username: 'test',
      showTitle: true, showYear: true, showRating: true, showDate: false,
      cardType: 'list',
      listCount: 10,
    })
    expect(blob).toBeInstanceOf(Blob)
  })

  it('renders a 20-film list card', async () => {
    const films = Array.from({ length: 20 }, (_, i) => ({
      title: `Film ${i}`, year: '2024', rating: '★★★',
      posterDataUrl: 'data:image/png;base64,abc',
    }))
    const blob = await renderCard({
      films,
      username: 'test',
      showTitle: true, showYear: true, showRating: true, showDate: false,
      cardType: 'list',
      listCount: 20,
    })
    expect(blob).toBeInstanceOf(Blob)
  })

  it('renders a card with card type label', async () => {
    const blob = await renderCard({
      ...MOCK_OPTIONS,
      showCardTypeLabel: true,
      cardTypeLabel: 'Last Four Watched',
    })
    expect(blob).toBeInstanceOf(Blob)
  })

  it('throws when films array is empty', async () => {
    await expect(renderCard({ ...MOCK_OPTIONS, films: [] })).rejects.toThrow('No films found to render.')
  })

  it('renders a card with title and description metadata', async () => {
    const films = Array.from({ length: 4 }, (_, i) => ({
      title: `Film ${i}`, year: '2024', rating: '',
      posterDataUrl: 'data:image/png;base64,abc',
    }))
    const blob = await renderCard({
      films,
      username: 'test',
      showTitle: true, showYear: false, showRating: false, showDate: false,
      cardType: 'list',
      listCount: 4,
      showListTitle: true,
      showListDescription: true,
      listTitle: 'My 2025 Releases Ranked',
      listDescription: 'A fantastic year for musical horror movies',
    })
    expect(blob).toBeInstanceOf(Blob)
  })
})

describe('computeLayout', () => {
  it('4 films → cols=4, cardHeight=590 (unchanged)', () => {
    const layout = computeLayout(4)
    expect(layout.cols).toBe(4)
    expect(layout.rows).toBe(1)
    expect(layout.cardHeight).toBe(590)
    expect(layout.posterW).toBe(200)
  })

  it('10 films → cols=5, rows=2, cardHeight > 560', () => {
    const layout = computeLayout(10)
    expect(layout.cols).toBe(5)
    expect(layout.rows).toBe(2)
    expect(layout.cardHeight).toBeGreaterThan(560)
  })

  it('20 films → cols=5, rows=4, taller than 10-film card', () => {
    const layout10 = computeLayout(10)
    const layout20 = computeLayout(20)
    expect(layout20.cols).toBe(5)
    expect(layout20.rows).toBe(4)
    expect(layout20.cardHeight).toBeGreaterThan(layout10.cardHeight)
  })

  it('5-column layout fits within 1200px width', () => {
    const layout = computeLayout(10)
    const usedWidth = layout.cols * layout.posterW + (layout.cols - 1) * layout.posterGap
    expect(layout.posterLeft * 2 + usedWidth).toBe(layout.cardWidth)
  })

  it('titleAreaH shifts posterTop, footerY, and cardHeight by the same amount', () => {
    const base    = computeLayout(4)
    const shifted = computeLayout(4, 60)
    expect(shifted.posterTop).toBe(base.posterTop + 60)
    expect(shifted.footerY).toBe(base.footerY + 60)
    expect(shifted.cardHeight).toBe(base.cardHeight + 60)
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
