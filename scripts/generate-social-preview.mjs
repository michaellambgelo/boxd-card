/**
 * Generates docs/social-preview.png for Open Graph / Twitter Card meta tags.
 *
 * Replicates the renderCard.ts layout with hardcoded sample data so no browser
 * is required. Run with:  npm run generate:preview
 */

import { createCanvas } from 'canvas'
import { writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

// ── Constants (match renderCard.ts) ──────────────────────────────────────────

const BG_COLOR      = '#1a1a1a'
const TEXT_COLOR    = '#ffffff'
const SUBTEXT_COLOR = '#99aabb'
const DIM_COLOR     = '#666677'

const HEADER_H    = 90
const POSTER_TOP  = 110
const TEXT_AREA_H = 60
const POSTER_W    = 200
const POSTER_H    = 300
const POSTER_GAP  = 20
const CARD_W      = 1200

const totalPosterW = 4 * POSTER_W + 3 * POSTER_GAP   // 860
const posterLeft   = Math.floor((CARD_W - totalPosterW) / 2)  // 170
const footerY      = POSTER_TOP + POSTER_H + TEXT_AREA_H + 56 // 526
const CARD_H       = footerY + 64                              // 590

// Standard OG image size; card is centered vertically with even padding
const IMG_W    = 1200
const IMG_H    = 630
const OFFSET_Y = Math.floor((IMG_H - CARD_H) / 2)  // 20

// ── Sample Data ───────────────────────────────────────────────────────────────

const films = [
  { title: 'Anora',          year: '2024', rating: '★★★★½', top: '#4a1830', bot: '#220d18' },
  { title: 'The Brutalist',  year: '2024', rating: '★★★★',  top: '#2c2820', bot: '#181510' },
  { title: 'Conclave',       year: '2024', rating: '★★★½',  top: '#1e2035', bot: '#0e101e' },
  { title: 'Dune: Part Two', year: '2024', rating: '★★★★',  top: '#302818', bot: '#1a1408' },
]

// ── Canvas ────────────────────────────────────────────────────────────────────

const canvas = createCanvas(IMG_W, IMG_H)
const ctx    = canvas.getContext('2d')

function truncate(text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text
  let t = text
  while (t.length > 0 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1)
  return t + '…'
}

// ── Background ────────────────────────────────────────────────────────────────

ctx.fillStyle = BG_COLOR
ctx.fillRect(0, 0, IMG_W, IMG_H)

// ── Header ────────────────────────────────────────────────────────────────────

const headerMidY = OFFSET_Y + HEADER_H / 2

// Letterboxd logo: three overlapping coloured circles + wordmark
// Circle positions scaled from the SVG viewBox (500×110) to LOGO_H=75
const cR = 12.3  // 18.027 * (75/110)
const cY = headerMidY
const oX = 40 + 33.4   // orange
const gX = 40 + 54.3   // green
const bX = 40 + 75.2   // blue

ctx.fillStyle = '#FF8000'
ctx.beginPath(); ctx.arc(oX, cY, cR, 0, Math.PI * 2); ctx.fill()
ctx.fillStyle = '#00E054'
ctx.beginPath(); ctx.arc(gX, cY, cR, 0, Math.PI * 2); ctx.fill()
ctx.fillStyle = '#40BCF4'
ctx.beginPath(); ctx.arc(bX, cY, cR, 0, Math.PI * 2); ctx.fill()

ctx.fillStyle = TEXT_COLOR
ctx.font = 'bold 28px sans-serif'
ctx.textAlign = 'left'
ctx.textBaseline = 'middle'
ctx.fillText('letterboxd', bX + cR + 14, cY)

// Date (right-aligned in header)
ctx.fillStyle = SUBTEXT_COLOR
ctx.font = '30px sans-serif'
ctx.textAlign = 'right'
ctx.textBaseline = 'middle'
ctx.fillText('March 22, 2026', CARD_W - 40, headerMidY)

// ── Poster Grid ───────────────────────────────────────────────────────────────

films.forEach((film, i) => {
  const x = posterLeft + i * (POSTER_W + POSTER_GAP)
  const y = OFFSET_Y + POSTER_TOP

  // Gradient poster placeholder
  const grad = ctx.createLinearGradient(x, y, x + POSTER_W * 0.4, y + POSTER_H)
  grad.addColorStop(0, film.top)
  grad.addColorStop(1, film.bot)
  ctx.fillStyle = grad
  ctx.fillRect(x, y, POSTER_W, POSTER_H)

  // Subtle diagonal highlight
  const shine = ctx.createLinearGradient(x, y, x + POSTER_W, y)
  shine.addColorStop(0, 'rgba(255,255,255,0.07)')
  shine.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = shine
  ctx.fillRect(x, y, POSTER_W, POSTER_H)

  // Bottom fade + title inside poster
  const fade = ctx.createLinearGradient(x, y + POSTER_H - 64, x, y + POSTER_H)
  fade.addColorStop(0, 'rgba(0,0,0,0)')
  fade.addColorStop(1, 'rgba(0,0,0,0.78)')
  ctx.fillStyle = fade
  ctx.fillRect(x, y + POSTER_H - 64, POSTER_W, 64)

  ctx.fillStyle = TEXT_COLOR
  ctx.font = 'bold 13px sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'bottom'
  ctx.fillText(truncate(film.title, POSTER_W - 12), x + 6, y + POSTER_H - 6)

  // Below-poster metadata
  ctx.fillStyle = TEXT_COLOR
  ctx.font = '14px sans-serif'
  ctx.textBaseline = 'top'
  ctx.fillText(truncate(`${film.title} (${film.year})`, POSTER_W), x, y + POSTER_H + 10)

  ctx.fillStyle = '#FFB020'
  ctx.font = '14px sans-serif'
  ctx.fillText(film.rating, x, y + POSTER_H + 30)
})

// ── Footer ────────────────────────────────────────────────────────────────────

const footerCanvasY = OFFSET_Y + footerY

ctx.fillStyle = SUBTEXT_COLOR
ctx.font = '27px sans-serif'
ctx.textAlign = 'left'
ctx.textBaseline = 'middle'
ctx.fillText('letterboxd.com/michaellamb', 40, footerCanvasY)

ctx.fillStyle = DIM_COLOR
ctx.font = '23px sans-serif'
ctx.textAlign = 'right'
ctx.textBaseline = 'middle'
ctx.fillText('generated by Boxd Card', CARD_W - 40, footerCanvasY)

// ── Write PNG ─────────────────────────────────────────────────────────────────

const outPath = path.join(ROOT, 'docs', 'social-preview.png')
writeFileSync(outPath, canvas.toBuffer('image/png'))
console.log(`Saved → ${outPath}`)
