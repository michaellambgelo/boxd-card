import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Layout } from '../types'
import { renderCard, loadImage, computeLayout, wrapText, drawTagPills, gridTextAreaHeight, milestoneGrid, fitPosterGrid, measureGridFit, GRID_MIN_TEXT_POSTER_W, IMAGE_LOAD_TIMEOUT_MS } from './renderCard'

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

  it.each([
    ['4:5' as const, 1350],
    ['3:4' as const, 1440],
  ])('%s layout: 4 films → 1080×%i fixed, text below poster', (layout, expectedH) => {
    const l = computeLayout(4, 0, layout)
    expect(l.cardWidth).toBe(1080)
    expect(l.cardHeight).toBe(expectedH)
    expect(l.cols).toBe(2)
    expect(l.rows).toBe(2)
  })

  // ── Fixed-frame layouts stay their stated size at every film count ────────
  // The bug: 5–20 films fell through to a hardcoded 3-column grid whose height
  // grew with the rows, so a 20-film "4:5" card came out 1080×4763.
  const FIXED_FRAMES: Array<[Layout, number, number]> = [
    ['square', 1080, 1080],
    ['4:5' as const,    1080, 1350],
    ['3:4' as const,    1080, 1440],
    ['story',  1080, 1920],
    ['banner', 1500, 750],
  ]

  describe.each(FIXED_FRAMES)('%s layout, 5–20 films', (layout, w, h) => {
    const cases: Array<[number, number, number]> = []
    for (let n = 5; n <= 20; n++) for (const titleAreaH of [0, 60, 120]) for (const tah of [120, 159]) {
      cases.push([n, titleAreaH, tah])
    }

    it('is always the stated size and the grid never leaves its box', () => {
      for (const [n, titleAreaH, tah] of cases) {
        const l = computeLayout(n, titleAreaH, layout, tah)
        const where = `${n} films, titleAreaH ${titleAreaH}, text ${tah}`
        expect(l.cardWidth, where).toBe(w)
        expect(l.cardHeight, where).toBe(h)
        expect(l.footerY, where).toBe(h - 64)
        expect(l.cols * l.rows, where).toBeGreaterThanOrEqual(n)
        expect(l.posterW, where).toBeGreaterThan(0)
        // Horizontal: inside the 40px margins.
        const right = l.posterLeft + l.cols * l.posterW + (l.cols - 1) * l.posterGap
        expect(l.posterLeft, where).toBeGreaterThanOrEqual(40)
        expect(right, where).toBeLessThanOrEqual(w - 40)
        // Vertical: below the title area, clear of the footer.
        const lastRowBottom = l.posterTop + (l.rows - 1) * (l.posterH + l.textAreaH)
          + l.posterH + (l.metaMode === 'below' ? tah : 0)
        expect(l.posterTop, where).toBeGreaterThanOrEqual(110 + titleAreaH)
        expect(lastRowBottom, where).toBeLessThanOrEqual(l.footerY - 56)
      }
    })

    it('only keeps the text block when posters are wide enough to carry it', () => {
      for (const [n, titleAreaH, tah] of cases) {
        const l = computeLayout(n, titleAreaH, layout, tah)
        if (l.metaMode === 'below') {
          expect(l.posterW).toBeGreaterThanOrEqual(GRID_MIN_TEXT_POSTER_W)
          // Row pitch covers the whole text block, with air before the next row.
          expect(l.textAreaH).toBeGreaterThan(tah)
        }
      }
    })
  })

  it('4:5, 20 films with the full text block → 5×4, rating on the poster', () => {
    const l = computeLayout(20, 60, '4:5', 159)
    expect([l.cols, l.rows]).toEqual([5, 4])
    expect(l.metaMode).toBe('overlay')
    expect(l.cardHeight).toBe(1350)
    expect(l.posterW).toBeGreaterThan(160)
  })

  it('4:5, 10 films → 5×2 with the text block kept under each poster', () => {
    const l = computeLayout(10, 60, '4:5', 159)
    expect([l.cols, l.rows]).toEqual([5, 2])
    expect(l.metaMode).toBe('below')
  })

  it('story, 20 films is tall enough to keep the text block', () => {
    const l = computeLayout(20, 60, 'story', 159)
    expect([l.cols, l.rows]).toEqual([5, 4])
    expect(l.metaMode).toBe('below')
  })

  it('with no per-film field on, no empty band is reserved under the rows', () => {
    const withText = computeLayout(10, 60, '4:5', 120)
    const without  = computeLayout(10, 60, '4:5', 120, false)
    expect(without.metaMode).toBe('overlay')
    expect(without.posterW).toBeGreaterThan(withText.posterW)
  })

  it('landscape is untouched: 5 columns of 208×312, height grows', () => {
    for (const n of [10, 20]) {
      const l = computeLayout(n, 60, 'landscape', 159)
      expect(l.cols).toBe(5)
      expect([l.posterW, l.posterH]).toEqual([208, 312])
      expect(l.metaMode).toBe('below')
      expect(l.cardHeight).toBe(110 + 60 + Math.ceil(n / 5) * (312 + 159) + 56 + 64)
    }
  })

  it('≤4 films keep their hand-tuned arrangements', () => {
    expect(computeLayout(4, 0, '4:5').metaMode).toBe('below')
    expect(computeLayout(4, 0, 'banner').rows).toBe(1)
    expect(computeLayout(1, 0, 'story').posterW).toBe(900)
  })

  describe('fitPosterGrid', () => {
    it('prefers a balanced grid to a slightly larger ragged one', () => {
      // 10 films in the 4:5 box: 4×3 would be a few px larger but leaves 2 orphans.
      const g = fitPosterGrid(10, 1000, 1060, 64, 20, 0)
      expect([g.cols, g.rows]).toEqual([5, 2])
    })

    it('accepts a ragged grid when it is much larger', () => {
      // 10 films in the story box: 4+4+2 fills the frame, 5×2 leaves half of it empty.
      const g = fitPosterGrid(10, 1000, 1630, 159, 20, 0)
      expect([g.cols, g.rows]).toEqual([4, 3])
    })

    it('never overflows the box in either axis', () => {
      for (let n = 1; n <= 20; n++) for (const [aw, ah] of [[1000, 790], [1000, 1060], [1420, 460], [1000, 1630]] as Array<[number, number]>) {
        for (const [extra, gapY] of [[159, 0], [0, 16]] as Array<[number, number]>) {
          const g = fitPosterGrid(n, aw, ah, extra, 20, gapY)
          expect(g.cols * g.posterW + (g.cols - 1) * 20).toBeLessThanOrEqual(aw)
          expect(g.rows * (g.posterH + extra) + (g.rows - 1) * gapY).toBeLessThanOrEqual(ah)
        }
      }
    })
  })

  describe('measureGridFit', () => {
    const films = Array.from({ length: 20 }, (_, i) => ({
      title: `Film ${i}`, year: '2020', rating: '★★★★', date: 'Nov 18, 2026', posterDataUrl: '',
    }))
    const base = {
      films, username: 'u', cardType: 'recent-diary' as const, listCount: 20 as const,
      showTitle: true, showYear: true, showRating: true, showDate: true,
      showCardTypeLabel: true, cardTypeLabel: 'Recent Diary',
    }

    it('reports the fields a dense fixed-frame card left off', () => {
      const fit = measureGridFit({ ...base, layout: '4:5' })
      expect(fit).not.toBeNull()
      expect(fit!.hiddenFields).toEqual(['title', 'year', 'date'])
      expect(fit!.filmCount).toBe(20)
      expect(fit!.fittingLayouts).toContain('landscape')
      expect(fit!.fittingLayouts).not.toContain('square')
    })

    it('is null when the text block is on the card', () => {
      expect(measureGridFit({ ...base, layout: 'landscape' })).toBeNull()
      expect(measureGridFit({ ...base, layout: '4:5', listCount: 10 })).toBeNull()
      expect(measureGridFit({ ...base, layout: '4:5', listCount: 4 })).toBeNull()
    })

    it('is null when only the rating was on — nothing is missing', () => {
      expect(measureGridFit({
        ...base, layout: '4:5', showTitle: false, showYear: false, showDate: false,
      })).toBeNull()
    })

    it('is null for review cards', () => {
      expect(measureGridFit({ ...base, cardType: 'review', layout: '4:5' })).toBeNull()
    })
  })

  it('titleAreaH shifts posterTop, footerY, and cardHeight by the same amount', () => {
    const base    = computeLayout(4)
    const shifted = computeLayout(4, 60)
    expect(shifted.posterTop).toBe(base.posterTop + 60)
    expect(shifted.footerY).toBe(base.footerY + 60)
    expect(shifted.cardHeight).toBe(base.cardHeight + 60)
  })

  // Issue #36 — https://github.com/michaellambgelo/boxd-card/issues/36
  // Static textAreaH=120 was ~35px short on Story 4-film 2×2 when all four
  // per-film meta lines (title + year + rating + per-film watch date) were
  // drawn, so row 0's watch date overflowed into row 1's poster image.
  describe('issue #36: per-film metadata overflow', () => {
    it('gridTextAreaHeight floors at the legacy TEXT_AREA_H (120) for back-compat', () => {
      expect(gridTextAreaHeight({})).toBe(120)
      expect(gridTextAreaHeight({ showTitle: true })).toBe(120)
      expect(gridTextAreaHeight({ showTitle: true, showYear: true })).toBe(120)
    })

    it('gridTextAreaHeight ignores showDate for cardTypes that put date in the header', () => {
      // For last-four-watched, favorites, list: showDate → today\'s date in
      // the header (right side), not per-film. So flipping showDate on must
      // NOT grow the per-film text block compared to flipping it off.
      const without = gridTextAreaHeight({
        showTitle: true, showYear: true, showRating: true, showDate: false,
        cardType: 'last-four-watched',
      })
      const withDate = gridTextAreaHeight({
        showTitle: true, showYear: true, showRating: true, showDate: true,
        cardType: 'last-four-watched',
      })
      expect(withDate).toBe(without)
    })

    it('gridTextAreaHeight grows above 120 for recent-diary with all meta lines on', () => {
      const h = gridTextAreaHeight({
        showTitle: true, showYear: true, showRating: true, showDate: true,
        cardType: 'recent-diary',
      })
      expect(h).toBeGreaterThan(120)
      // Worst-case 2-line title (56) + year (28+4) + rating (28+4) + date (25)
      // + top pad (10) = 159. The function must reserve at least that.
      expect(h).toBeGreaterThanOrEqual(159)
    })

    it('computeLayout threads textAreaHeight into the Story 4-film layout', () => {
      const legacy = computeLayout(4, 0, 'story')                  // default = 120
      const grown  = computeLayout(4, 0, 'story', 160)             // recent-diary worst-case
      expect(legacy.textAreaH).toBe(120)
      expect(grown.textAreaH).toBe(160)
      // Bigger meta budget on a fixed 1920px canvas → smaller posters.
      expect(grown.posterH).toBeLessThan(legacy.posterH)
      // The row pitch (posterH + textAreaH) is what separates row 0\'s poster
      // from row 1\'s poster. With the dynamic textAreaH = 160, the row pitch
      // is large enough that the rendered meta block (≤159 px worst case) fits
      // entirely between the posters instead of bleeding into row 1.
      expect(grown.textAreaH).toBeGreaterThanOrEqual(159)
    })

    it('computeLayout threads textAreaHeight into the 4:5 / 3:4 4-film layouts', () => {
      for (const layoutName of ['4:5', '3:4'] as const) {
        const grown = computeLayout(4, 0, layoutName, 160)
        const legacy = computeLayout(4, 0, layoutName)
        expect(grown.textAreaH).toBe(160)
        expect(grown.posterH).toBeLessThan(legacy.posterH)
      }
    })
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

  it('rejects with an Error when the image errors', async () => {
    const { MockImage, getCapture } = makeMockImageClass()
    vi.stubGlobal('Image', MockImage as unknown as typeof Image)

    const promise = loadImage('data:image/png;base64,INVALID')
    getCapture()!.onerror?.(new Event('error'))

    await expect(promise).rejects.toThrow('Image failed to load')
  })

  it('rejects when the image neither loads nor errors', async () => {
    vi.useFakeTimers()
    try {
      const { MockImage } = makeMockImageClass()
      vi.stubGlobal('Image', MockImage as unknown as typeof Image)

      // Never fire onload/onerror — this is the wedge that used to leave the
      // popup stuck in "Generating…" forever.
      const promise = loadImage('data:image/png;base64,abc')
      const assertion = expect(promise).rejects.toThrow('timed out')
      await vi.advanceTimersByTimeAsync(IMAGE_LOAD_TIMEOUT_MS + 1)
      await assertion
    } finally {
      vi.useRealTimers()
    }
  })

  it('clears the timeout once the image has loaded', async () => {
    vi.useFakeTimers()
    try {
      const { MockImage, getCapture } = makeMockImageClass()
      vi.stubGlobal('Image', MockImage as unknown as typeof Image)

      const promise = loadImage('data:image/png;base64,abc')
      getCapture()!.onload?.()
      await promise

      // A pending timer here would fire reject() on an already-settled promise.
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
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

  it('renders a review card with TMDB-sourced director/runtime/genres/overview', async () => {
    const enriched = {
      ...reviewFilm,
      director: 'Harold Ramis',
      runtime: 101,
      genres: ['Comedy', 'Fantasy'],
      overview: 'A weatherman is stuck reliving the same day over and over.',
    }
    const blob = await renderCard({
      films: [enriched],
      username: 'michaellamb',
      showTitle: true, showYear: true, showRating: true, showDate: true,
      cardType: 'review',
      reviewCount: 1,
      showDirector: true, showRuntime: true, showGenres: true, showOverview: true,
      usedTmdb: true,
    })
    expect(blob).toBeInstanceOf(Blob)
  })

  it('renders a review card with TMDB toggles off (no TMDB fields drawn)', async () => {
    // Film still carries TMDB-sourced fields, but the flags are unset — they should not be drawn.
    const blob = await renderCard({
      films: [{
        ...reviewFilm,
        director: 'Harold Ramis', runtime: 101, genres: ['Comedy'], overview: 'Synopsis…',
      }],
      username: 'test',
      showTitle: true, showYear: true, showRating: true, showDate: true,
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

  it.each(['square', '4:5', '3:4', 'story', 'banner'] as const)('renders a single review in %s layout', async (layout) => {
    const blob = await renderCard({
      films: [reviewFilm],
      username: 'michaellamb',
      showTitle: true, showYear: true, showRating: true, showDate: true,
      cardType: 'review',
      reviewCount: 1,
      layout,
    })
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('image/png')
  })

  it.each(['square', '4:5', '3:4', 'story', 'banner'] as const)('renders 4-review card in %s layout', async (layout) => {
    const blob = await renderCard({
      films: Array.from({ length: 4 }, () => reviewFilm),
      username: 'test',
      showTitle: true, showYear: true, showRating: true, showDate: true,
      cardType: 'review',
      reviewCount: 4,
      layout,
    })
    expect(blob).toBeInstanceOf(Blob)
  })
})

describe('renderCard — TMDB attribution', () => {
  // Tracks every src value set on an Image instance during the test
  let srcLog: string[] = []

  class TrackingImage {
    onload?: () => void
    onerror?: () => void
    private _src = ''
    get src() { return this._src }
    set src(value: string) {
      this._src = value
      if (value) {
        srcLog.push(value)
        queueMicrotask(() => this.onload?.())
      }
    }
  }

  beforeEach(() => {
    srcLog = []
    vi.stubGlobal('Image', TrackingImage as unknown as typeof Image)
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('loads TMDB logo when usedTmdb is true', async () => {
    await renderCard({ ...MOCK_OPTIONS, usedTmdb: true })
    // Vite inlines small SVGs as data URLs; match on the TMDB viewBox fingerprint.
    expect(srcLog.some(src => src.includes('273.42') && src.includes('35.52'))).toBe(true)
  })

  it('does NOT load TMDB logo when usedTmdb is false', async () => {
    await renderCard({ ...MOCK_OPTIONS, usedTmdb: false })
    expect(srcLog.some(src => src.includes('273.42') && src.includes('35.52'))).toBe(false)
  })

  it('does NOT load TMDB logo when usedTmdb is undefined', async () => {
    await renderCard(MOCK_OPTIONS)
    expect(srcLog.some(src => src.includes('273.42') && src.includes('35.52'))).toBe(false)
  })

  it('loads TMDB logo for review cards when usedTmdb is true', async () => {
    await renderCard({
      films: [{
        title: 'Groundhog Day',
        year: '1993',
        rating: '★★★★★',
        posterDataUrl: 'data:image/png;base64,abc',
        date: 'Feb 02, 2026',
        reviewText: 'A masterpiece.',
      }],
      username: 'michaellamb',
      showTitle: true, showYear: true, showRating: true, showDate: true,
      cardType: 'review',
      reviewCount: 1,
      usedTmdb: true,
    })
    // Vite inlines small SVGs as data URLs; match on the TMDB viewBox fingerprint.
    expect(srcLog.some(src => src.includes('273.42') && src.includes('35.52'))).toBe(true)
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

// ── Milestone grid ───────────────────────────────────────────────────────────
// The card height comes from the chosen Layout, not from the content. A single
// row of posters capped at 160px left roughly 60% of a 3:4 card empty (observed
// on a real 6-milestone card), so the posters now size to the available box and
// wrap when that yields something bigger.

// Available box after the header, stats header and "Milestones" title, per layout.
const BOX = {
  landscape: { w: 1120, h: 291 },
  banner:    { w: 1420, h: 411 },
  square:    { w: 1000, h: 741 },
  '4:5':     { w: 1000, h: 1011 },
  '3:4':     { w: 1000, h: 1101 },
  story:     { w: 1000, h: 1581 },
}
const LABEL_H = 28, DATE_H = 30, GAP_X = 16, GAP_Y = 24

function measure(count: number, w: number, h: number) {
  const g = milestoneGrid(count, w, h)
  const rows = Math.ceil(count / g.cols)
  return {
    ...g,
    rows,
    gridW: g.cols * g.posterW + (g.cols - 1) * GAP_X,
    gridH: rows * (LABEL_H + g.posterH + DATE_H) + (rows - 1) * GAP_Y,
  }
}

describe('milestoneGrid', () => {
  const counts = [2, 3, 4, 6, 8, 12]

  it('never overflows the box it was given, on any layout or entry count', () => {
    for (const [layout, { w, h }] of Object.entries(BOX)) {
      for (const n of counts) {
        const m = measure(n, w, h)
        expect(m.gridW, `${layout} n=${n} width`).toBeLessThanOrEqual(w)
        expect(m.gridH, `${layout} n=${n} height`).toBeLessThanOrEqual(h)
      }
    }
  })

  it('keeps posters at a sane size and aspect', () => {
    for (const [layout, { w, h }] of Object.entries(BOX)) {
      for (const n of counts) {
        const g = milestoneGrid(n, w, h)
        expect(g.posterW, `${layout} n=${n}`).toBeGreaterThan(0)
        expect(g.posterW, `${layout} n=${n}`).toBeLessThanOrEqual(280)
        expect(g.posterH).toBe(Math.round(g.posterW * 1.5))
        expect(g.cols).toBeGreaterThanOrEqual(1)
        expect(g.cols).toBeLessThanOrEqual(n)
      }
    }
  })

  it('fills a tall card far better than the old fixed single row', () => {
    // The regression case: 6 milestones on 3:4 used to draw 146px posters in one
    // row and leave the bottom ~60% of the card empty.
    const m = measure(6, BOX['3:4'].w, BOX['3:4'].h)
    expect(m.posterW).toBeGreaterThan(160)
    expect(m.rows).toBeGreaterThan(1)
    expect(m.gridH / BOX['3:4'].h).toBeGreaterThan(0.8)
  })

  it('stays on one row when the card is wide and short', () => {
    for (const layout of ['landscape', 'banner'] as const) {
      expect(measure(6, BOX[layout].w, BOX[layout].h).rows, layout).toBe(1)
    }
  })

  it('does not stack two entries into a single column on non-story layouts', () => {
    // Both arrangements hit the size cap, so the tie-break decides. A lone
    // column of two posters on a 3:4 card reads as a mistake.
    for (const layout of ['landscape', 'banner', 'square', '4:5', '3:4'] as const) {
      expect(measure(2, BOX[layout].w, BOX[layout].h).cols, layout).toBe(2)
    }
  })

  it('prefers balanced rows over a ragged last one', () => {
    // 4 entries on 4:5 fits 280px posters as either 2+2 or 3+1; pick 2+2.
    expect(measure(4, BOX['4:5'].w, BOX['4:5'].h).cols).toBe(2)
  })

  it('degrades to a visible poster rather than nothing when the box is tiny', () => {
    const g = milestoneGrid(12, 200, 80)
    expect(g.posterW).toBeGreaterThan(0)
    expect(g.posterH).toBeGreaterThan(0)
  })

  it('handles a single milestone', () => {
    const g = milestoneGrid(1, BOX['3:4'].w, BOX['3:4'].h)
    expect(g.cols).toBe(1)
    expect(g.posterW).toBeGreaterThan(0)
  })
})
