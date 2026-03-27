import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderCard, loadImage, computeLayout, wrapText, drawTagPills } from './renderCard'

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

  it('renders with a logged-in user avatar in the footer', async () => {
    const blob = await renderCard({
      ...MOCK_OPTIONS,
      footerAvatarDataUrl: 'data:image/png;base64,abc',
      showShareIcon: false,
    })
    expect(blob).toBeInstanceOf(Blob)
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
  it('4 films → cols=4, cardHeight=650', () => {
    const layout = computeLayout(4)
    expect(layout.cols).toBe(4)
    expect(layout.rows).toBe(1)
    expect(layout.cardHeight).toBe(650)
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

describe('drawTagPills', () => {
  function makeCtx() {
    const drawn: Array<{ type: string; text?: string }> = []
    return {
      font: '',
      measureText: (text: string) => ({ width: text.length * 8 }),
      fillStyle: '' as string,
      textAlign: '' as string,
      textBaseline: '' as string,
      fillText: (text: string) => drawn.push({ type: 'text', text }),
      beginPath: () => drawn.push({ type: 'beginPath' }),
      roundRect: () => drawn.push({ type: 'roundRect' }),
      fill: () => drawn.push({ type: 'fill' }),
      _drawn: drawn,
    } as unknown as CanvasRenderingContext2D & { _drawn: typeof drawn }
  }

  it('returns 0 for empty tags array', () => {
    const ctx = makeCtx()
    expect(drawTagPills(ctx, [], 0, 0, 500, false)).toBe(0)
  })

  it('returns TAG_PILL_H (56) for a single tag that fits', () => {
    const ctx = makeCtx()
    const h = drawTagPills(ctx, ['sci-fi'], 0, 0, 500, false)
    expect(h).toBe(56)
  })

  it('wraps to a second row when pills overflow maxWidth', () => {
    const ctx = makeCtx()
    // Each tag "aaaaaaaaaa" (10 chars) → 80px text + 40px padding (TAG_PAD_X*2) = 120px pill
    // maxWidth=100: first pill placed at curX=0 (no prior pill to trigger wrap check),
    // second pill at curX=135 → 135+120 > 100 && curX>0 → new row
    const h = drawTagPills(ctx, ['aaaaaaaaaa', 'aaaaaaaaaa'], 0, 0, 100, false)
    expect(h).toBe(56 + 15 + 56)  // two rows: PILL_H + ROW_GAP + PILL_H
  })

  it('draws pill backgrounds and text when draw=true', () => {
    const ctx = makeCtx()
    drawTagPills(ctx, ['tag'], 0, 0, 500, true)
    const drawn = (ctx as unknown as { _drawn: Array<{ type: string }> })._drawn
    expect(drawn.some(d => d.type === 'roundRect')).toBe(true)
    expect(drawn.some(d => d.type === 'fill')).toBe(true)
    expect(drawn.some((d: { type: string; text?: string }) => d.type === 'text' && d.text === 'tag')).toBe(true)
  })

  it('does not draw anything when draw=false', () => {
    const ctx = makeCtx()
    drawTagPills(ctx, ['tag'], 0, 0, 500, false)
    const drawn = (ctx as unknown as { _drawn: Array<{ type: string }> })._drawn
    expect(drawn).toHaveLength(0)
  })
})

describe('wrapText', () => {
  // Build a minimal CanvasRenderingContext2D-like object for measurement tests.
  // measureText returns width = 10px per character (deterministic).
  function makeCtx(charsPerLine = 10) {
    const drawn: string[] = []
    return {
      font: '',
      measureText: (text: string) => ({ width: text.length * 10 }),
      fillText: (text: string) => { drawn.push(text) },
      _drawn: drawn,
      _charsPerLine: charsPerLine,
    } as unknown as CanvasRenderingContext2D & { _drawn: string[]; _charsPerLine: number }
  }

  it('returns 0 for empty text', () => {
    const ctx = makeCtx()
    expect(wrapText(ctx, '', 0, 0, 500, 24, false)).toBe(0)
  })

  it('returns one lineHeight for a short line that fits', () => {
    const ctx = makeCtx()
    // maxWidth=500, each char=10px → "hello" (5 chars = 50px) fits easily
    const height = wrapText(ctx, 'hello', 0, 0, 500, 24, false)
    expect(height).toBe(24)
  })

  it('wraps long text into multiple lines', () => {
    const ctx = makeCtx()
    // maxWidth=30 (3 chars per word "aa" = 20px; "aa bb" = 50px > 30 → wraps)
    // Words "aa bb cc" → line1: "aa bb"? No: "aa"=20, "aa bb"=50>30 → wrap. Actually:
    // line="aa", test "aa bb"→50>30 && line→flush, line="bb"; test "bb cc"→50>30 && line→flush, line="cc"; end→flush
    // So 3 lines × 24 = 72
    const height = wrapText(ctx, 'aa bb cc', 0, 0, 30, 24, false)
    expect(height).toBe(72)
  })

  it('draws lines when draw=true', () => {
    const ctx = makeCtx()
    wrapText(ctx, 'one two', 0, 0, 500, 24, true)
    expect((ctx as unknown as { _drawn: string[] })._drawn).toEqual(['one two'])
  })

  it('handles \\n\\n paragraph breaks with extra spacing', () => {
    const ctx = makeCtx()
    // Two short paragraphs → 2 lines + 1 paragraph gap (Math.round(24*0.5)=12)
    const height = wrapText(ctx, 'hello\n\nworld', 0, 0, 500, 24, false)
    expect(height).toBe(24 + 12 + 24)  // line1 + para-gap + line2
  })

  it('handles \\n hard line breaks within a paragraph', () => {
    const ctx = makeCtx()
    // Two hard lines, no paragraph gap between them
    const height = wrapText(ctx, 'line one\nline two', 0, 0, 500, 24, false)
    expect(height).toBe(48)
  })
})

describe('renderCard — review type', () => {
  beforeEach(() => {
    vi.stubGlobal('Image', class AutoImage {
      onload?: () => void
      onerror?: () => void
      private _src = ''
      get src() { return this._src }
      set src(v: string) { this._src = v; if (v) queueMicrotask(() => this.onload?.()) }
    } as unknown as typeof Image)
  })
  afterEach(() => { vi.unstubAllGlobals() })

  const reviewFilm = {
    title: 'Groundhog Day',
    year: '1993',
    rating: '★★★★★',
    posterDataUrl: 'data:image/png;base64,abc',
    date: 'Feb 02, 2026',
    reviewText: 'One of the greatest films ever made.',
  }

  it('renders a single review card as a PNG Blob', async () => {
    const blob = await renderCard({
      films: [reviewFilm],
      username: 'michaellamb',
      showTitle: true, showYear: true, showRating: true, showDate: true,
      cardType: 'review',
      reviewCount: 1,
    })
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('image/png')
  })

  it('renders 4-review card', async () => {
    const blob = await renderCard({
      films: Array.from({ length: 4 }, () => reviewFilm),
      username: 'test',
      showTitle: true, showYear: true, showRating: true, showDate: true,
      cardType: 'review',
      reviewCount: 4,
    })
    expect(blob).toBeInstanceOf(Blob)
  })

  it('renders with all options disabled', async () => {
    const blob = await renderCard({
      films: [{ ...reviewFilm, rating: '', date: undefined }],
      username: 'test',
      showTitle: false, showYear: false, showRating: false, showDate: false,
      cardType: 'review',
      reviewCount: 1,
    })
    expect(blob).toBeInstanceOf(Blob)
  })

  it('throws when films array is empty', async () => {
    await expect(renderCard({
      films: [],
      username: 'test',
      showTitle: true, showYear: true, showRating: true, showDate: true,
      cardType: 'review',
      reviewCount: 1,
    })).rejects.toThrow('No films found to render.')
  })

  it('renders with a backdrop data URL', async () => {
    const blob = await renderCard({
      films: [reviewFilm],
      username: 'michaellamb',
      showTitle: true, showYear: true, showRating: true, showDate: true,
      cardType: 'review',
      reviewCount: 1,
      backdropDataUrl: 'data:image/png;base64,abc',
    })
    expect(blob).toBeInstanceOf(Blob)
  })

  it('renders with a logged-in user avatar in the footer', async () => {
    const blob = await renderCard({
      films: [reviewFilm],
      username: 'michaellamb',
      showTitle: true, showYear: true, showRating: true, showDate: true,
      cardType: 'review',
      reviewCount: 1,
      footerAvatarDataUrl: 'data:image/png;base64,abc',
      showShareIcon: false,
    })
    expect(blob).toBeInstanceOf(Blob)
  })
})

describe('renderCard — backdrop', () => {
  beforeEach(() => {
    vi.stubGlobal('Image', class AutoImage {
      onload?: () => void
      onerror?: () => void
      private _src = ''
      get src() { return this._src }
      set src(v: string) { this._src = v; if (v) queueMicrotask(() => this.onload?.()) }
    } as unknown as typeof Image)
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('renders a list card with backdrop', async () => {
    const films = Array.from({ length: 4 }, (_, i) => ({
      title: `Film ${i}`, year: '2024', rating: '★★★',
      posterDataUrl: 'data:image/png;base64,abc',
    }))
    const blob = await renderCard({
      films,
      username: 'test',
      showTitle: true, showYear: true, showRating: true, showDate: false,
      cardType: 'list',
      listCount: 4,
      backdropDataUrl: 'data:image/png;base64,abc',
    })
    expect(blob).toBeInstanceOf(Blob)
  })

  it('renders without backdrop when backdropDataUrl is absent', async () => {
    const films = Array.from({ length: 4 }, (_, i) => ({
      title: `Film ${i}`, year: '2024', rating: '★★★',
      posterDataUrl: 'data:image/png;base64,abc',
    }))
    const blob = await renderCard({
      films,
      username: 'test',
      showTitle: true, showYear: false, showRating: false, showDate: false,
      cardType: 'last-four-watched',
    })
    expect(blob).toBeInstanceOf(Blob)
  })
})
