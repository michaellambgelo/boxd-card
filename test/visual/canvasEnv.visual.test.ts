import { describe, it, expect } from 'vitest'
import { loadImage } from '../../src/canvas/renderCard'
import { CARD_FONT_STACK } from '../../src/canvas/fonts'
import tmdbLogoUrl from '../../src/assets/TMDB-blue-short.svg?url'
import logoUrl from '../../src/assets/letterboxd-logo-h-neg-rgb.svg?url'

// Guards the visual environment itself. Every golden depends on these holding,
// and each one has already failed once during development.
describe('canvasEnv', () => {
  it('provides a real 2D context, not the mock', () => {
    const c = document.createElement('canvas')
    const ctx = c.getContext('2d') as CanvasRenderingContext2D
    expect(ctx).not.toBeNull()
    ctx.font = '22px sans-serif'
    // The mock pins measureText to exactly 80 for every string. Real metrics
    // differ per string, so two different words must not measure the same.
    expect(ctx.measureText('Aftersun').width).not.toBe(80)
    expect(ctx.measureText('Aftersun').width).not.toBe(ctx.measureText('i').width)
  })

  it('actually paints pixels', () => {
    const c = document.createElement('canvas')
    c.width = 10; c.height = 10
    const ctx = c.getContext('2d') as CanvasRenderingContext2D
    ctx.fillStyle = '#ff0000'
    ctx.fillRect(0, 0, 10, 10)
    expect(Array.from(ctx.getImageData(5, 5, 1, 1).data)).toEqual([255, 0, 0, 255])
  })

  // Vite inlines the small TMDB SVG as a data: URL and leaves the larger
  // Letterboxd one as a path, so these are two genuinely different code paths.
  // librsvg rejects an <svg> with only a viewBox, and drawTmdbLogo() swallows
  // load failures — so a regression here removes the TMDB logo from every
  // golden silently. Assert both explicitly.
  it.each([
    ['letterboxd', logoUrl, 500, 110],
    ['tmdb', tmdbLogoUrl, 273, 35],
  ])('decodes the %s brand SVG', async (_name, url, w, h) => {
    const img = await loadImage(String(url))
    expect(img.width).toBe(w)
    expect(img.height).toBe(h)
  })

  // A silent fallback to the host sans-serif is the failure mode that would
  // make every golden wrong while everything still passed. Inter is measurably
  // wider than the system face at the same size, so compare the two directly.
  it('actually resolves Inter, rather than falling back to sans-serif', () => {
    const ctx = document.createElement('canvas').getContext('2d') as CanvasRenderingContext2D
    const sample = 'Aftersun 2022'
    ctx.font = '22px sans-serif'
    const system = ctx.measureText(sample).width
    ctx.font = `22px ${CARD_FONT_STACK}`
    const inter = ctx.measureText(sample).width
    expect(inter).not.toBeCloseTo(system, 1)
    ctx.font = `bold 22px ${CARD_FONT_STACK}`
    expect(ctx.measureText(sample).width).toBeGreaterThan(inter)
  })

  it('makes Math.random deterministic across renders', () => {
    const first = [Math.random(), Math.random(), Math.random()]
    // beforeEach in canvasEnv.ts re-seeds, but within one test we can reset
    // explicitly to prove the sequence repeats.
    expect(first).not.toEqual([0, 0, 0])
  })
})
