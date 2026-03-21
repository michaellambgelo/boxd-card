import type { CardType, ListCount } from '../types'
import logoUrl from '../assets/letterboxd-logo-h-neg-rgb.svg?url'

export interface FilmEntry {
  title: string
  year: string
  rating: string
  posterDataUrl: string
  date?: string   // forwarded from FilmData for diary entries
}

export interface CardOptions {
  films: FilmEntry[]
  username: string
  showTitle: boolean
  showYear: boolean   // only relevant when showTitle is true
  showRating: boolean
  showDate: boolean
  cardType: CardType
  listCount?: ListCount
}

export interface CardLayout {
  cardWidth: number
  cardHeight: number
  posterW: number
  posterH: number
  posterGap: number
  posterLeft: number
  posterTop: number
  cols: number
  rows: number
  footerY: number
  textAreaH: number
}

const HEADER_H   = 60
const POSTER_TOP = 80   // = HEADER_H + 20
const TEXT_AREA_H = 60  // space below each poster for title + rating

/**
 * Compute card layout geometry based on film count.
 * filmCount ≤ 4: single row of 4 at 200px each (1200×560, unchanged)
 * filmCount 5–20: 5-column grid, 208px posters, taller card
 */
export function computeLayout(filmCount: number): CardLayout {
  if (filmCount <= 4) {
    // Existing layout — keep exact pixel values unchanged
    return {
      cardWidth: 1200, cardHeight: 560,
      posterW: 200, posterH: 300, posterGap: 20,
      posterLeft: 170,   // (1200 − 860) / 2
      posterTop: POSTER_TOP,
      cols: 4, rows: 1,
      footerY: 496,
      textAreaH: TEXT_AREA_H,
    }
  }

  // 5-column layout for 10 or 20 films
  // posterLeft=40, gap=20 → 5×208 + 4×20 = 1120 = 1200 − 2×40 ✓
  const cols = 5
  const rows = Math.ceil(filmCount / cols)
  const posterW = 208
  const posterH = 312
  const rowH = posterH + TEXT_AREA_H   // 372
  const footerY = POSTER_TOP + rows * rowH + 56
  const cardHeight = footerY + 64

  return {
    cardWidth: 1200, cardHeight,
    posterW, posterH, posterGap: 20,
    posterLeft: 40,
    posterTop: POSTER_TOP,
    cols, rows,
    footerY,
    textAreaH: TEXT_AREA_H,
  }
}

const BG_COLOR      = '#1a1a1a'
const TEXT_COLOR    = '#ffffff'
const SUBTEXT_COLOR = '#99aabb'
const DIM_COLOR     = '#666677'

// SVG viewBox is 500×110; draw at a height that fits the 60px header
const LOGO_H = 44
const LOGO_W = Math.round(LOGO_H * 500 / 110)  // ≈ 200

async function drawLogo(ctx: CanvasRenderingContext2D, x: number, centerY: number) {
  const img = await loadImage(logoUrl)
  ctx.drawImage(img, x, centerY - LOGO_H / 2, LOGO_W, LOGO_H)
}

function truncate(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  let truncated = text
  while (truncated.length > 0 && ctx.measureText(truncated + '…').width > maxWidth) {
    truncated = truncated.slice(0, -1)
  }
  return truncated + '…'
}

export async function renderCard(options: CardOptions): Promise<Blob> {
  const { films, username, showTitle, showYear, showRating, showDate, cardType, listCount } = options

  const filmCount = (cardType === 'list' || cardType === 'recent-diary')
    ? (listCount ?? 4)
    : Math.min(films.length, 4)
  const layout = computeLayout(filmCount)

  const canvas = document.createElement('canvas')
  canvas.width  = layout.cardWidth
  canvas.height = layout.cardHeight
  const ctx = canvas.getContext('2d')!

  // Background
  ctx.fillStyle = BG_COLOR
  ctx.fillRect(0, 0, layout.cardWidth, layout.cardHeight)

  // ── Header ────────────────────────────────────────────────
  const headerMidY = HEADER_H / 2

  await drawLogo(ctx, 40, headerMidY)

  // Date in header: all types except recent-diary (which shows per-film dates instead)
  if (showDate && cardType !== 'recent-diary') {
    const dateStr = new Date().toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    })
    ctx.fillStyle = SUBTEXT_COLOR
    ctx.font = '15px sans-serif'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    ctx.fillText(dateStr, layout.cardWidth - 40, headerMidY)
  }

  // ── Posters ───────────────────────────────────────────────
  for (let i = 0; i < Math.min(films.length, filmCount); i++) {
    const film = films[i]
    const col = i % layout.cols
    const row = Math.floor(i / layout.cols)
    const x = layout.posterLeft + col * (layout.posterW + layout.posterGap)
    const y = layout.posterTop  + row * (layout.posterH + layout.textAreaH)

    try {
      const img = await loadImage(film.posterDataUrl)
      ctx.drawImage(img, x, y, layout.posterW, layout.posterH)
    } catch {
      ctx.fillStyle = '#333344'
      ctx.fillRect(x, y, layout.posterW, layout.posterH)
    }

    if (showTitle) {
      const displayTitle = showYear && film.year
        ? `${film.title} (${film.year})`
        : film.title
      ctx.fillStyle = TEXT_COLOR
      ctx.font = '14px sans-serif'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText(truncate(ctx, displayTitle, layout.posterW), x, y + layout.posterH + 10)
    }

    if (showRating && film.rating) {
      ctx.fillStyle = '#FFB020'
      ctx.font = '14px sans-serif'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      const ratingY = y + layout.posterH + (showTitle ? 30 : 10)
      ctx.fillText(film.rating, x, ratingY)
    }

    // For diary type: show per-film watch date under the rating when showDate is on
    if (cardType === 'recent-diary' && showDate && film.date) {
      const dateOffset = y + layout.posterH + (showRating && film.rating ? 50 : showTitle ? 30 : 10)
      ctx.fillStyle = SUBTEXT_COLOR
      ctx.font = '12px sans-serif'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText(film.date, x, dateOffset)
    }
  }

  // ── Footer ────────────────────────────────────────────────
  ctx.fillStyle = SUBTEXT_COLOR
  ctx.font = '15px sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(`letterboxd.com/${username}`, 40, layout.footerY)

  ctx.fillStyle = DIM_COLOR
  ctx.font = '13px sans-serif'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  ctx.fillText('generated by Boxd Card', layout.cardWidth - 40, layout.footerY)

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('canvas.toBlob returned null'))
      },
      'image/png'
    )
  })
}

export async function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = dataUrl
  })
}
