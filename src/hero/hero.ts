// Entry point for the /about hero: draws the sample cards with the real
// renderer and redraws them on "Shuffle the gradient".
//
// Built by vite.hero.config.ts into docs/about/hero.js (+ hero.css for the
// card typeface). The About page stays hand-written; this script only fills
// the <img data-hero-card="…"> slots it finds there.
import '../assets/fonts/fonts.css'
import { renderCard } from '../canvas/renderCard'
import { generateAltText } from '../altText'
import { HERO_CARDS, heroCardOptions, heroPosterUrl, type HeroCard } from './heroCards'

/** Data URLs per card, fetched once and reused by every shuffle. */
const posterCache = new Map<HeroCard, Promise<string[]>>()

async function posterToDataUrl(url: string): Promise<string> {
  const res = await fetch(url, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' })
  if (!res.ok) throw new Error(`poster ${res.status}`)
  const blob = await res.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('poster read failed'))
    reader.readAsDataURL(blob)
  })
}

function postersFor(card: HeroCard): Promise<string[]> {
  let hit = posterCache.get(card)
  if (!hit) {
    // A failed poster becomes '' so the renderer draws its grey placeholder,
    // the same way one bad image degrades a card in the product.
    hit = Promise.all(card.films.map((f) => posterToDataUrl(heroPosterUrl(f)).catch(() => '')))
    posterCache.set(card, hit)
  }
  return hit
}

const liveUrls = new Map<HTMLImageElement, string>()

async function drawInto(img: HTMLImageElement, card: HeroCard): Promise<void> {
  const options = heroCardOptions(card, await postersFor(card))
  const blob = await renderCard(options)
  const url = URL.createObjectURL(blob)
  img.alt = generateAltText(options)
  await new Promise<void>((resolve) => {
    img.onload = () => resolve()
    img.onerror = () => resolve()
    img.src = url
  })
  const previous = liveUrls.get(img)
  if (previous) URL.revokeObjectURL(previous)
  liveUrls.set(img, url)
  img.closest('[data-hero-frame]')?.setAttribute('data-state', 'ready')
}

let drawing: Promise<void> | null = null

function drawAll(): Promise<void> {
  // Ignore clicks while a draw is in flight rather than queueing them up.
  if (drawing) return drawing
  drawing = Promise.all(
    HERO_CARDS.map(async (card) => {
      const img = document.querySelector<HTMLImageElement>(`img[data-hero-card="${card.slot}"]`)
      if (!img) return
      try {
        await drawInto(img, card)
      } catch (err) {
        // Content-free on purpose: the page runs Faro, which captures console.warn.
        console.warn('[hero] card render failed', err instanceof Error ? err.name : 'unknown')
        img.closest('[data-hero-frame]')?.setAttribute('data-state', 'failed')
      }
    }),
  ).then(() => undefined).finally(() => { drawing = null })
  return drawing
}

function init(): void {
  void drawAll()
  document.querySelectorAll('[data-hero-shuffle]').forEach((button) => {
    button.addEventListener('click', () => { void drawAll() })
  })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
