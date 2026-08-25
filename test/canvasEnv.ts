// Environment for the visual (golden-image) suite.
//
// Two things make real rendering work here, and only one of them is code.
//
// 1. This project does NOT load test/setup.canvasMock.ts. With the `canvas`
//    package present, jsdom already backs HTMLCanvasElement with node-canvas,
//    so getContext('2d'), measureText, getImageData and toDataURL are all real.
//    Verified: measureText('Aftersun') at 22px returns 81.93, not the mock's 80.
//
// 2. jsdom's own HTMLImageElement never settles — it does not fetch resources,
//    so `new Image()` with a data: URL fires neither onload nor onerror and
//    renderCard()'s loadImage() would hang until its 10s timeout. node-canvas's
//    Image does decode, and jsdom's drawImage accepts it. So we swap the global.
//
// The wrapper below exists for one reason: Vite's `?url` asset imports (the two
// brand SVGs at renderCard.ts:3-4) resolve under vitest to a root-relative path
// like "/src/assets/letterboxd-logo-h-neg-rgb.svg", not a data: URL. node-canvas
// cannot fetch a path. We read it off disk and hand over a data: URL instead.
// node-canvas rasterizes SVG via librsvg, so the real logos draw.
import { beforeEach } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { extname, resolve as resolvePath } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { Image: NodeCanvasImage } = require('canvas')

const ROOT = process.cwd()

const MIME: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
}

/**
 * librsvg (which backs node-canvas's SVG support) refuses an <svg> that carries
 * only a viewBox: "Width and height must be set on the svg element". Browsers
 * infer both from the viewBox, so this is a limitation of the test rasterizer,
 * NOT a defect in the asset.
 *
 * src/assets/TMDB-blue-short.svg is exactly that shape, and drawTmdbLogo()
 * swallows load failures by design ("skip attribution logo on load failure"),
 * so without this the TMDB logo silently vanishes from every golden while
 * rendering perfectly in the real extension — a golden that disagrees with
 * production in a way nothing would report.
 *
 * We add the attributes the browser would have inferred. The vendored asset is
 * left untouched: it is a brand file, and it is not the thing that is wrong.
 */
function ensureSvgDimensions(svg: string): string {
  const openTag = svg.match(/<svg\b[^>]*>/)
  if (!openTag) return svg
  const tag = openTag[0]
  if (/\bwidth\s*=/.test(tag) && /\bheight\s*=/.test(tag)) return svg

  const vb = tag.match(/viewBox\s*=\s*["']\s*([-\d.]+)[,\s]+([-\d.]+)[,\s]+([-\d.]+)[,\s]+([-\d.]+)\s*["']/)
  if (!vb) return svg
  const w = Number(vb[3])
  const h = Number(vb[4])
  if (!isFinite(w) || !isFinite(h) || w <= 0 || h <= 0) return svg

  return svg.replace(tag, tag.replace(/^<svg\b/, `<svg width="${w}" height="${h}"`))
}

const SVG_DATA_URL = /^data:image\/svg\+xml(;base64)?,/i

/**
 * Vite inlines assets under `assetsInlineLimit` (4096 bytes by default) as
 * data: URLs and leaves larger ones as paths — so of the two brand SVGs,
 * TMDB-blue-short.svg (2065 B) arrives already inlined and URL-encoded, while
 * letterboxd-logo-h-neg-rgb.svg (7311 B) arrives as "/src/assets/...".
 *
 * Both need the dimension fix, so it has to be applied to the data: form too.
 * Missing this is why the TMDB logo was absent from the first real render while
 * the Letterboxd logo drew fine.
 */
function fixSvgDataUrl(value: string): string {
  const m = value.match(SVG_DATA_URL)
  if (!m) return value
  const body = value.slice(m[0].length)
  let svg: string
  try {
    svg = m[1] ? Buffer.from(body, 'base64').toString('utf8') : decodeURIComponent(body)
  } catch {
    return value
  }
  const fixed = ensureSvgDimensions(svg)
  if (fixed === svg) return value
  return `data:image/svg+xml;base64,${Buffer.from(fixed, 'utf8').toString('base64')}`
}

/**
 * Turn whatever renderCard hands us into something node-canvas can decode.
 * Real poster data: URLs pass through untouched — that is the production shape.
 * A bare path is a Vite `?url` asset; read it and inline it.
 */
function toLoadable(value: unknown): unknown {
  if (typeof value !== 'string') return value
  if (SVG_DATA_URL.test(value)) return fixSvgDataUrl(value)
  if (value.startsWith('data:')) return value

  const rel = value.replace(/^\/+/, '').split('?')[0]
  const abs = resolvePath(ROOT, rel)
  if (!abs.startsWith(ROOT) || !existsSync(abs)) return value

  const ext = extname(abs).toLowerCase()
  const mime = MIME[ext]
  if (!mime) return value

  if (ext === '.svg') {
    const fixed = ensureSvgDimensions(readFileSync(abs, 'utf8'))
    return `data:${mime};base64,${Buffer.from(fixed, 'utf8').toString('base64')}`
  }
  return `data:${mime};base64,${readFileSync(abs).toString('base64')}`
}

const nativeSrc = Object.getOwnPropertyDescriptor(NodeCanvasImage.prototype, 'src')

class TestImage extends NodeCanvasImage {}

if (nativeSrc?.set && nativeSrc?.get) {
  Object.defineProperty(TestImage.prototype, 'src', {
    configurable: true,
    enumerable: true,
    get(this: unknown) { return nativeSrc.get!.call(this) },
    set(this: unknown, value: unknown) { nativeSrc.set!.call(this, toLoadable(value)) },
  })
}

globalThis.Image = TestImage as unknown as typeof Image

// ── Determinism ──────────────────────────────────────────────────────────────
//
// drawBrandGradient() calls Math.random() three times per render (two brand
// colours plus a gradient angle) — deliberately, so consecutive cards don't
// look identical. That feature is fine in the product and fatal to a golden:
// the same card renders a different background every time.
//
// So the visual project gets a seeded PRNG instead, reset before every test.
// The product is untouched; only this environment is made repeatable. If a
// future golden needs to assert the randomness itself, seed it differently
// rather than reaching for the real Math.random.
const SEED = 0x5eed1e

function mulberry32(seed: number) {
  let a = seed >>> 0
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function resetRandom(seed: number = SEED): void {
  Math.random = mulberry32(seed)
}

resetRandom()

// Applies to every file in the visual project. Reset per test so a golden never
// depends on how many renders ran before it.
beforeEach(() => { resetRandom() })
