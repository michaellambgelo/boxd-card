import type { CardType, ListCount, ReviewCount, Layout } from '../types'
import logoUrl from '../assets/letterboxd-logo-h-neg-rgb.svg?url'

export interface FilmEntry {
  title: string
  year: string
  rating: string
  posterDataUrl: string
  date?: string        // forwarded from FilmData for diary/review entries
  reviewText?: string  // forwarded from FilmData for review entries
  tags?: string[]      // forwarded from FilmData for review entries
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
  showListTitle?: boolean
  showListDescription?: boolean
  listTitle?: string
  listDescription?: string
  showCardTypeLabel?: boolean
  cardTypeLabel?: string
  reviewCount?: ReviewCount
  showTags?: boolean
  listTags?: string[]
  backdropDataUrl?: string
  footerAvatarDataUrl?: string  // avatar for the footer identity (own avatar or author avatar)
  showShareIcon?: boolean        // true when generating from someone else's profile
  layout?: Layout
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
  /** When true, text is drawn to the right of each poster instead of below. */
  sideLayout: boolean
}

const HEADER_H    = 90
const POSTER_TOP  = 110  // = HEADER_H + 20
const TEXT_AREA_H = 120  // space below each poster for title + year + rating + date

// Font sizes for poster-grid card text (title/rating/date under each poster)
const GRID_TITLE_FS    = 24
const GRID_META_FS     = 24
const GRID_DATE_FS     = 21
const GRID_LINE_H      = 28  // line height for 24px text
const GRID_DATE_LINE_H = 25  // line height for 21px text
const GRID_LINE_GAP    =  4  // gap between consecutive text lines
const GRID_TEXT_PAD    = 10  // top padding above first text item

/**
 * Compute card layout geometry based on film count, optional title area height, and layout format.
 * Layout determines canvas dimensions and grid arrangement:
 *   landscape: 1200px wide, variable height (existing default)
 *   square:    1080×1080 fixed (≤4 films, 2×2), 1080px wide 3-col (5-20)
 *   banner:    1500×750 fixed (≤4 films, 1×4), 1500px wide 5-col (5-20)
 *   story:     1080×1920 fixed (≤4 films, 2×2 or 1-film showcase), 1080px wide 2-col (5-20)
 */
export function computeLayout(filmCount: number, titleAreaH = 0, layout: Layout = 'landscape'): CardLayout {
  const pt = POSTER_TOP + titleAreaH

  // ── Landscape (existing behavior) ────────────────────────────────────────
  if (layout === 'landscape') {
    if (filmCount <= 4) {
      const posterW = 200
      const posterH = 300
      const posterGap = 20
      const effectiveCols = Math.max(1, filmCount)
      const totalPosterW = effectiveCols * posterW + (effectiveCols - 1) * posterGap
      const posterLeft = Math.floor((1200 - totalPosterW) / 2)
      const footerY = pt + posterH + TEXT_AREA_H + 56
      return {
        cardWidth: 1200, cardHeight: footerY + 64,
        posterW, posterH, posterGap,
        posterLeft, posterTop: pt,
        cols: effectiveCols, rows: 1,
        footerY, textAreaH: TEXT_AREA_H,
        sideLayout: false,
      }
    }

    const cols = 5
    const rows = Math.ceil(filmCount / cols)
    const posterW = 208
    const posterH = 312
    const footerY = pt + rows * (posterH + TEXT_AREA_H) + 56
    return {
      cardWidth: 1200, cardHeight: footerY + 64,
      posterW, posterH, posterGap: 20,
      posterLeft: 40, posterTop: pt,
      cols, rows, footerY,
      textAreaH: TEXT_AREA_H,
      sideLayout: false,
    }
  }

  // ── Square (2×2 side-by-side for ≤4, 3-col grid for 5-20) ─────────────
  if (layout === 'square') {
    const cardWidth = 1080
    if (filmCount <= 4) {
      // 2×2 grid with text beside each poster (side-by-side within each cell)
      const cardHeight = 1080
      const footerY = cardHeight - 64
      const cols = Math.min(Math.max(1, filmCount), 2)
      const rows = Math.ceil(filmCount / cols)
      const margin = 30
      const interCellGap = 24
      const cellW = Math.floor((cardWidth - 2 * margin - (cols - 1) * interCellGap) / cols)
      const posterH = 340
      const posterW = Math.round(posterH * 2 / 3)   // ~227
      // posterGap = stride from one cell's poster left to next cell's poster left - posterW
      // equals the text area + interCellGap
      const posterGap = cols > 1 ? cellW + interCellGap - posterW : 0
      const posterLeft = margin  // left-align cells to margin
      // Center rows vertically in available space
      const available = footerY - pt - 56
      const totalRowH = rows * posterH + (rows - 1) * interCellGap
      const posterTop2 = pt + Math.floor((available - totalRowH) / 2)
      return {
        cardWidth, cardHeight,
        posterW, posterH, posterGap,
        posterLeft, posterTop: posterTop2,
        cols, rows, footerY, textAreaH: 0,
        sideLayout: true,
      }
    }

    const cols = 3
    const posterW = 320
    const posterH = 480
    const rows = Math.ceil(filmCount / cols)
    const footerY = pt + rows * (posterH + TEXT_AREA_H) + 56
    const posterLeft = Math.floor((cardWidth - (cols * posterW + (cols - 1) * 20)) / 2)
    return {
      cardWidth, cardHeight: footerY + 64,
      posterW, posterH, posterGap: 20,
      posterLeft, posterTop: pt,
      cols, rows, footerY,
      textAreaH: TEXT_AREA_H,
      sideLayout: false,
    }
  }

  // ── Banner (1500×750 fixed for ≤4, 5-col variable for 5-20) ─────────────
  if (layout === 'banner') {
    const cardWidth = 1500
    if (filmCount <= 4) {
      const cardHeight = 750
      const footerY = cardHeight - 64
      const textAreaH = 90
      const posterH = footerY - pt - 56 - textAreaH
      const posterW = Math.round(posterH * 2 / 3)
      const effectiveCols = Math.max(1, filmCount)
      const totalPosterW = effectiveCols * posterW
      const gapSpace = cardWidth - 2 * 40 - totalPosterW
      const posterGap = effectiveCols > 1 ? Math.round(gapSpace / (effectiveCols - 1)) : 0
      const gridW = totalPosterW + (effectiveCols - 1) * posterGap
      const posterLeft = Math.floor((cardWidth - gridW) / 2)
      return {
        cardWidth, cardHeight,
        posterW, posterH, posterGap,
        posterLeft, posterTop: pt,
        cols: effectiveCols, rows: 1,
        footerY, textAreaH,
        sideLayout: false,
      }
    }

    const cols = 5
    const posterW = Math.floor((cardWidth - 80 - 4 * 20) / cols)
    const posterH = Math.round(posterW * 3 / 2)
    const rows = Math.ceil(filmCount / cols)
    const footerY = pt + rows * (posterH + TEXT_AREA_H) + 56
    return {
      cardWidth, cardHeight: footerY + 64,
      posterW, posterH, posterGap: 20,
      posterLeft: 40, posterTop: pt,
      cols, rows, footerY,
      textAreaH: TEXT_AREA_H,
      sideLayout: false,
    }
  }

  // ── Story (1080×1920 fixed for ≤4, 2-col variable for 5-20) ─────────────
  const cardWidth = 1080
  if (filmCount === 1) {
    // Single-film showcase: large poster filling most of the canvas
    const cardHeight = 1920
    const footerY = cardHeight - 64
    const posterW = 900
    const posterH = Math.round(posterW * 3 / 2)
    const posterLeft = Math.floor((cardWidth - posterW) / 2)
    const textAreaH = footerY - pt - posterH - 56
    return {
      cardWidth, cardHeight,
      posterW, posterH, posterGap: 0,
      posterLeft, posterTop: pt,
      cols: 1, rows: 1,
      footerY, textAreaH,
      sideLayout: false,
    }
  }

  if (filmCount <= 4) {
    // 2×2 grid with large posters
    const cardHeight = 1920
    const footerY = cardHeight - 64
    const cols = Math.min(filmCount, 2)
    const rows = Math.ceil(filmCount / cols)
    const textAreaH = 120
    const available = footerY - pt - 56
    const posterH = Math.floor(available / rows) - textAreaH
    const posterW = Math.round(posterH * 2 / 3)
    const posterGap = 20
    const totalW = cols * posterW + (cols - 1) * posterGap
    const posterLeft = Math.floor((cardWidth - totalW) / 2)
    return {
      cardWidth, cardHeight,
      posterW, posterH, posterGap,
      posterLeft, posterTop: pt,
      cols, rows, footerY, textAreaH,
      sideLayout: false,
    }
  }

  // 5-20 films: 2-col variable height
  const cols = 2
  const posterW = Math.floor((cardWidth - 80 - 20) / cols)
  const posterH = Math.round(posterW * 3 / 2)
  const textAreaH = 120
  const rows = Math.ceil(filmCount / cols)
  const footerY = pt + rows * (posterH + textAreaH) + 56
  const posterLeft = Math.floor((cardWidth - (cols * posterW + 20)) / 2)
  return {
    cardWidth, cardHeight: footerY + 64,
    posterW, posterH, posterGap: 20,
    posterLeft, posterTop: pt,
    cols, rows, footerY, textAreaH,
    sideLayout: false,
  }
}

const BG_COLOR      = '#1a1a1a'
const TEXT_COLOR    = '#ffffff'
const SUBTEXT_COLOR = '#99aabb'
const DIM_COLOR     = '#666677'

// SVG viewBox is 500×110; draw at a height that fits the 90px header
const LOGO_H = 75
const LOGO_W = Math.round(LOGO_H * 500 / 110)  // ≈ 341

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

/**
 * Word-wraps `text` into lines within `maxWidth`, drawing each line at (x, currentY)
 * if `draw` is true. Handles `\n\n` paragraph breaks and `\n` hard line breaks.
 * Returns the total pixel height consumed (number of lines × lineHeight + paragraph gaps).
 */
export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  draw: boolean,
): number {
  if (!text) return 0
  let currentY = y
  const paragraphs = text.split('\n\n')

  for (let pi = 0; pi < paragraphs.length; pi++) {
    if (pi > 0) currentY += Math.round(lineHeight * 0.5)  // paragraph gap
    const hardLines = paragraphs[pi].split('\n')

    for (const hardLine of hardLines) {
      const words = hardLine.split(' ').filter(w => w.length > 0)
      if (words.length === 0) { currentY += lineHeight; continue }

      let line = ''
      for (const word of words) {
        const testLine = line ? `${line} ${word}` : word
        if (line && ctx.measureText(testLine).width > maxWidth) {
          if (draw) ctx.fillText(line, x, currentY)
          line = word
          currentY += lineHeight
        } else {
          line = testLine
        }
      }
      if (line) {
        if (draw) ctx.fillText(line, x, currentY)
        currentY += lineHeight
      }
    }
  }

  return currentY - y
}

// ── Tag pills ────────────────────────────────────────────────────────────────
const TAG_FONT     = '30px sans-serif'
const TAG_PILL_H   = 56
const TAG_PAD_X    = 20
const TAG_GAP      = 15   // horizontal gap between pills
const TAG_ROW_GAP  = 15   // vertical gap between pill rows
const TAG_RADIUS   = 28   // fully rounded ends
const TAG_BG       = '#2d3a52'
const TAG_COLOR    = '#99aabb'

/**
 * Draws (or measures) a row of tag pills that wrap within `maxWidth`.
 * When `draw` is false, nothing is painted but the height consumed is returned.
 */
export function drawTagPills(
  ctx: CanvasRenderingContext2D,
  tags: string[],
  x: number,
  y: number,
  maxWidth: number,
  draw: boolean,
): number {
  if (!tags.length) return 0
  ctx.font = TAG_FONT

  let curX = x
  let curY = y

  for (const tag of tags) {
    const pillW = ctx.measureText(tag).width + TAG_PAD_X * 2
    if (curX + pillW > x + maxWidth && curX > x) {
      curX = x
      curY += TAG_PILL_H + TAG_ROW_GAP
    }
    if (draw) {
      ctx.fillStyle = TAG_BG
      ctx.beginPath()
      ctx.roundRect(curX, curY, pillW, TAG_PILL_H, TAG_RADIUS)
      ctx.fill()
      ctx.fillStyle = TAG_COLOR
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(tag, curX + TAG_PAD_X, curY + TAG_PILL_H / 2)
    }
    curX += pillW + TAG_GAP
  }

  return (curY - y) + TAG_PILL_H
}

// ── Background (solid or blurred backdrop) ───────────────────────────────────
const BACKDROP_BLUR = 20

async function drawBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  backdropDataUrl?: string,
): Promise<void> {
  // Solid fill is always drawn first — acts as fallback if backdrop load fails.
  ctx.fillStyle = BG_COLOR
  ctx.fillRect(0, 0, width, height)
  if (!backdropDataUrl) return
  try {
    const img = await loadImage(backdropDataUrl)
    const pad = BACKDROP_BLUR * 3

    // Cover-fit: maintain aspect ratio, center, and crop to fill the canvas.
    const imgAspect = img.width / img.height
    const canvasAspect = width / height
    let drawW: number, drawH: number, drawX: number, drawY: number
    if (imgAspect > canvasAspect) {
      // Image is wider than canvas — fit height, crop sides
      drawH = height + pad * 2
      drawW = drawH * imgAspect
      drawX = -(drawW - width) / 2
      drawY = -pad
    } else {
      // Image is taller/equal — fit width, crop top/bottom
      drawW = width + pad * 2
      drawH = drawW / imgAspect
      drawX = -pad
      drawY = -(drawH - height) / 2
    }

    ctx.filter = `blur(${BACKDROP_BLUR}px)`
    ctx.drawImage(img, drawX, drawY, drawW, drawH)
    ctx.filter = 'none'

    // Fade edges into BG_COLOR so the backdrop blends naturally on tall/wide cards
    const fadeSize = Math.min(200, Math.floor(Math.min(width, height) * 0.25))
    // Bottom edge fade
    const bottomGrad = ctx.createLinearGradient(0, height - fadeSize, 0, height)
    bottomGrad.addColorStop(0, 'rgba(26, 26, 26, 0)')
    bottomGrad.addColorStop(1, BG_COLOR)
    ctx.fillStyle = bottomGrad
    ctx.fillRect(0, height - fadeSize, width, fadeSize)
    // Top edge fade
    const topGrad = ctx.createLinearGradient(0, fadeSize, 0, 0)
    topGrad.addColorStop(0, 'rgba(26, 26, 26, 0)')
    topGrad.addColorStop(1, BG_COLOR)
    ctx.fillStyle = topGrad
    ctx.fillRect(0, 0, width, fadeSize)

    // Dark overlay so text and other content remain legible.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.72)'
    ctx.fillRect(0, 0, width, height)
  } catch {
    // Solid fallback already in place.
  }
}

/** Returns the base canvas width for a given layout. */
function layoutCardWidth(layout: Layout): number {
  if (layout === 'banner') return 1500
  if (layout === 'landscape') return 1200
  return 1080  // square and story
}

// ── Review card layout config ────────────────────────────────────────────────
interface ReviewLayoutConfig {
  posterW: number; posterH: number; posterX: number; contentX: number
  titleFs: number; titleH: number; metaFs: number; metaH: number; metaGap: number
  reviewFs: number; reviewLineH: number
  topPad: number; rowGap: number; footerGap: number
  fixedHeight: number | null   // null = dynamic (landscape), number = clamped
  stacked: boolean             // poster above text (story) vs side-by-side
}

function reviewLayoutConfig(layout: Layout): ReviewLayoutConfig {
  if (layout === 'square') {
    return {
      posterW: 160, posterH: 240, posterX: 40,
      contentX: 40 + 160 + 30,  // 230
      titleFs: 32, titleH: 46, metaFs: 26, metaH: 38, metaGap: 7,
      reviewFs: 26, reviewLineH: 36,
      topPad: 24, rowGap: 24, footerGap: 36,
      fixedHeight: 1080, stacked: false,
    }
  }
  if (layout === 'banner') {
    return {
      posterW: 160, posterH: 240, posterX: 40,
      contentX: 40 + 160 + 30,  // 230
      titleFs: 32, titleH: 46, metaFs: 26, metaH: 38, metaGap: 7,
      reviewFs: 26, reviewLineH: 36,
      topPad: 24, rowGap: 24, footerGap: 36,
      fixedHeight: 750, stacked: false,
    }
  }
  if (layout === 'story') {
    return {
      posterW: 280, posterH: 420, posterX: 0,  // centered dynamically
      contentX: 40,                             // full-width text below poster
      titleFs: 39, titleH: 54, metaFs: 32, metaH: 45, metaGap: 9,
      reviewFs: 30, reviewLineH: 42,
      topPad: 28, rowGap: 36, footerGap: 44,
      fixedHeight: 1920, stacked: true,
    }
  }
  // landscape (default)
  return {
    posterW: 200, posterH: 300, posterX: 40,
    contentX: 40 + 200 + 30,  // 270
    titleFs: 39, titleH: 54, metaFs: 32, metaH: 45, metaGap: 9,
    reviewFs: 30, reviewLineH: 42,
    topPad: 28, rowGap: 28, footerGap: 44,
    fixedHeight: null, stacked: false,
  }
}

interface ReviewRowMeasure {
  y: number
  rowH: number
}

/** Measure each review row's height without drawing anything. */
function measureReviewRows(
  films: FilmEntry[],
  count: number,
  showTitle: boolean,
  showYear: boolean,
  showRating: boolean,
  showDate: boolean,
  showTags: boolean,
  measureCtx: CanvasRenderingContext2D,
  rvContentW: number,
  cfg: ReviewLayoutConfig,
): { rows: ReviewRowMeasure[]; footerY: number; cardHeight: number } {
  const rows: ReviewRowMeasure[] = []
  let currentY = HEADER_H + cfg.topPad

  for (let i = 0; i < count; i++) {
    const film = films[i]
    let contentH = 0
    let firstMeta = true

    function addMetaLine(lineH: number) {
      if (!firstMeta) contentH += cfg.metaGap
      contentH += lineH
      firstMeta = false
    }

    if (showTitle) addMetaLine(cfg.titleH)
    if (showYear && film.year) addMetaLine(cfg.metaH)
    if (showRating && film.rating) addMetaLine(cfg.metaH)
    if (showDate && film.date) addMetaLine(cfg.metaH)
    if (showTags && film.tags?.length) {
      const tagsH = drawTagPills(measureCtx, film.tags, 0, 0, rvContentW, false)
      if (!firstMeta) contentH += cfg.metaGap
      contentH += tagsH
      firstMeta = false
    }

    if (film.reviewText) {
      if (!firstMeta) contentH += 21  // gap before review text
      measureCtx.font = `${cfg.reviewFs}px sans-serif`
      contentH += wrapText(measureCtx, film.reviewText, 0, 0, rvContentW, cfg.reviewLineH, false)
    }

    // Stacked layouts put poster above text; side-by-side puts them adjacent
    const stackedPosterH = cfg.stacked ? cfg.posterH + 16 : 0
    const rowH = cfg.stacked ? stackedPosterH + contentH : Math.max(cfg.posterH, contentH)
    rows.push({ y: currentY, rowH })
    currentY += rowH + (i < count - 1 ? cfg.rowGap : 0)
  }

  const footerY = currentY + cfg.footerGap
  const dynamicH = footerY + 64
  const cardHeight = cfg.fixedHeight != null ? cfg.fixedHeight : dynamicH
  return { rows, footerY: cfg.fixedHeight != null ? cfg.fixedHeight - 64 : footerY, cardHeight }
}

const LIST_PADDING = 12
const LIST_TITLE_H = 40
const LIST_DESC_H  = 24
const LIST_BOTTOM  = 8

export async function renderCard(options: CardOptions): Promise<Blob> {
  const {
    films, username, showTitle, showYear, showRating, showDate, cardType, listCount,
    showListTitle, showListDescription, listTitle, listDescription,
    showCardTypeLabel, cardTypeLabel, reviewCount, showTags, listTags, backdropDataUrl,
    footerAvatarDataUrl, showShareIcon,
  } = options

  // ── Review card ──────────────────────────────────────────────────────────
  if (cardType === 'review') {
    const effectiveLayout = options.layout ?? 'landscape'
    const cfg = reviewLayoutConfig(effectiveLayout)
    const cardWidth = layoutCardWidth(effectiveLayout)
    // For stacked layouts, text spans full width below the poster
    const rvContentW = cfg.stacked
      ? cardWidth - 2 * cfg.contentX
      : cardWidth - cfg.contentX - 40

    const count = Math.min(films.length, reviewCount ?? 1)
    if (count === 0) throw new Error('No films found to render.')

    // Pass 1: measure row heights using a temporary canvas
    const measureCanvas = document.createElement('canvas')
    const measureCtx = measureCanvas.getContext('2d')!
    const { rows, footerY, cardHeight } = measureReviewRows(
      films, count, showTitle, showYear, showRating, showDate, showTags ?? false, measureCtx, rvContentW, cfg
    )

    // Pass 2: draw
    const canvas = document.createElement('canvas')
    canvas.width  = cardWidth
    canvas.height = cardHeight
    const ctx = canvas.getContext('2d')!

    await drawBackground(ctx, cardWidth, cardHeight, backdropDataUrl)

    // Clip to footer boundary for fixed-height layouts
    if (cfg.fixedHeight != null) {
      ctx.save()
      ctx.beginPath()
      ctx.rect(0, 0, cardWidth, footerY)
      ctx.clip()
    }

    await drawLogo(ctx, 40, HEADER_H / 2)

    for (let i = 0; i < count; i++) {
      const film = films[i]
      const rowY = rows[i].y

      // Poster position: centered for stacked, fixed-x for side-by-side
      const posterX = cfg.stacked ? Math.floor((cardWidth - cfg.posterW) / 2) : cfg.posterX

      try {
        const img = await loadImage(film.posterDataUrl)
        ctx.drawImage(img, posterX, rowY, cfg.posterW, cfg.posterH)
      } catch {
        ctx.fillStyle = '#333344'
        ctx.fillRect(posterX, rowY, cfg.posterW, cfg.posterH)
      }

      // Text column: below poster (stacked) or beside poster (side-by-side)
      const textX = cfg.stacked ? cfg.contentX : cfg.contentX
      let contentY = cfg.stacked ? rowY + cfg.posterH + 16 : rowY
      let firstMeta = true

      function drawMetaLine(lineH: number, drawFn: () => void) {
        if (!firstMeta) contentY += cfg.metaGap
        drawFn()
        contentY += lineH
        firstMeta = false
      }

      if (showTitle) {
        drawMetaLine(cfg.titleH, () => {
          ctx.fillStyle = TEXT_COLOR
          ctx.font = `bold ${cfg.titleFs}px sans-serif`
          ctx.textAlign = 'left'
          ctx.textBaseline = 'top'
          ctx.fillText(truncate(ctx, film.title, rvContentW), textX, contentY)
        })
      }

      if (showYear && film.year) {
        drawMetaLine(cfg.metaH, () => {
          ctx.fillStyle = SUBTEXT_COLOR
          ctx.font = `${cfg.metaFs}px sans-serif`
          ctx.textAlign = 'left'
          ctx.textBaseline = 'top'
          ctx.fillText(film.year, textX, contentY)
        })
      }

      if (showRating && film.rating) {
        drawMetaLine(cfg.metaH, () => {
          ctx.fillStyle = '#FFB020'
          ctx.font = `${cfg.metaFs + 3}px sans-serif`
          ctx.textAlign = 'left'
          ctx.textBaseline = 'top'
          ctx.fillText(film.rating, textX, contentY)
        })
      }

      if (showDate && film.date) {
        drawMetaLine(cfg.metaH, () => {
          ctx.fillStyle = SUBTEXT_COLOR
          ctx.font = `${cfg.metaFs}px sans-serif`
          ctx.textAlign = 'left'
          ctx.textBaseline = 'top'
          ctx.fillText(film.date!, textX, contentY)
        })
      }

      if (showTags && film.tags?.length) {
        if (!firstMeta) contentY += cfg.metaGap
        contentY += drawTagPills(ctx, film.tags, textX, contentY, rvContentW, true)
        firstMeta = false
      }

      if (film.reviewText) {
        if (!firstMeta) contentY += 21
        ctx.fillStyle = TEXT_COLOR
        ctx.font = `${cfg.reviewFs}px sans-serif`
        ctx.textAlign = 'left'
        ctx.textBaseline = 'top'
        wrapText(ctx, film.reviewText, textX, contentY, rvContentW, cfg.reviewLineH, true)
      }
    }

    // Restore clip before drawing footer
    if (cfg.fixedHeight != null) {
      ctx.restore()
    }

    // Footer
    await drawFooter(ctx, footerY, cardWidth, username, footerAvatarDataUrl, showShareIcon)

    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => { if (blob) resolve(blob); else reject(new Error('canvas.toBlob returned null')) },
        'image/png'
      )
    })
  }

  // ── Poster-grid cards (existing logic) ───────────────────────────────────
  const effectiveLayout = options.layout ?? 'landscape'
  const filmCount = Math.min(
    films.length,
    (cardType === 'list' || cardType === 'recent-diary') ? (listCount ?? 4) : 4,
  )

  if (filmCount === 0) {
    throw new Error('No films found to render.')
  }

  const baseCardWidth = layoutCardWidth(effectiveLayout)
  const showingListTitle = cardType === 'list' && !!showListTitle && !!listTitle
  const showingListDesc  = cardType === 'list' && !!showListDescription && !!listDescription
  const showingCardTypeLabel = cardType !== 'list' && !!showCardTypeLabel && !!cardTypeLabel
  const showingListTags  = cardType === 'list' && !!showTags && !!listTags?.length

  // Measure list-tag pill height before computing layout (needs a canvas context)
  let listTagsAreaH = 0
  if (showingListTags && listTags) {
    const mCanvas = document.createElement('canvas')
    const mCtx = mCanvas.getContext('2d')!
    listTagsAreaH = LIST_PADDING + drawTagPills(mCtx, listTags, 0, 0, baseCardWidth - 80, false)
  }

  const titleAreaH = (showingListTitle || showingListDesc || showingCardTypeLabel || showingListTags)
    ? LIST_PADDING
      + (showingListTitle || showingCardTypeLabel ? LIST_TITLE_H : 0)
      + (showingListDesc  ? LIST_DESC_H  : 0)
      + listTagsAreaH
      + LIST_BOTTOM
    : 0

  const layout = computeLayout(filmCount, titleAreaH, effectiveLayout)

  const canvas = document.createElement('canvas')
  canvas.width  = layout.cardWidth
  canvas.height = layout.cardHeight
  const ctx = canvas.getContext('2d')!

  await drawBackground(ctx, layout.cardWidth, layout.cardHeight, backdropDataUrl)

  // ── Header ────────────────────────────────────────────────
  const headerMidY = HEADER_H / 2

  await drawLogo(ctx, 40, headerMidY)

  // Date in header: all types except recent-diary (which shows per-film dates instead)
  if (showDate && cardType !== 'recent-diary') {
    const dateStr = new Date().toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    })
    ctx.fillStyle = SUBTEXT_COLOR
    ctx.font = '30px sans-serif'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    ctx.fillText(dateStr, layout.cardWidth - 40, headerMidY)
  }

  // ── List title / description / card type label ────────────
  if (showingListTitle && listTitle) {
    ctx.fillStyle = TEXT_COLOR
    ctx.font = 'bold 36px sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(truncate(ctx, listTitle, layout.cardWidth - 80), 40, POSTER_TOP + LIST_PADDING)
  }
  if (showingListDesc && listDescription) {
    const descY = POSTER_TOP + LIST_PADDING + (showingListTitle ? LIST_TITLE_H : 0)
    ctx.fillStyle = SUBTEXT_COLOR
    ctx.font = '21px sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(truncate(ctx, listDescription, layout.cardWidth - 80), 40, descY)
  }
  if (showingListTags && listTags) {
    const tagsY = POSTER_TOP + LIST_PADDING
      + (showingListTitle ? LIST_TITLE_H : 0)
      + (showingListDesc  ? LIST_DESC_H  : 0)
      + LIST_PADDING
    drawTagPills(ctx, listTags, 40, tagsY, layout.cardWidth - 80, true)
  }
  if (showingCardTypeLabel && cardTypeLabel) {
    ctx.fillStyle = TEXT_COLOR
    ctx.font = 'bold 36px sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(cardTypeLabel, 40, POSTER_TOP + LIST_PADDING)
  }

  // ── Posters ───────────────────────────────────────────────
  for (let i = 0; i < Math.min(films.length, filmCount); i++) {
    const film = films[i]
    const col = i % layout.cols
    const row = Math.floor(i / layout.cols)
    const x = layout.posterLeft + col * (layout.posterW + layout.posterGap)
    const sideRowGap = 20  // vertical gap between rows in sideLayout
    const y = layout.sideLayout
      ? layout.posterTop + row * (layout.posterH + sideRowGap)
      : layout.posterTop + row * (layout.posterH + layout.textAreaH)

    try {
      const img = await loadImage(film.posterDataUrl)
      ctx.drawImage(img, x, y, layout.posterW, layout.posterH)
    } catch {
      ctx.fillStyle = '#333344'
      ctx.fillRect(x, y, layout.posterW, layout.posterH)
    }

    // Text position: beside poster (sideLayout) or below poster (grid)
    const sideTextPad = 16  // gap between poster and text in sideLayout
    const textX = layout.sideLayout ? x + layout.posterW + sideTextPad : x
    let maxTextW: number
    if (layout.sideLayout) {
      const isLastCol = col === layout.cols - 1
      const rightEdge = isLastCol
        ? layout.cardWidth - layout.posterLeft         // mirror left margin
        : x + layout.posterW + layout.posterGap - 12   // stop before next poster
      maxTextW = rightEdge - textX
    } else {
      maxTextW = layout.posterW
    }
    let textY = layout.sideLayout ? y : y + layout.posterH + GRID_TEXT_PAD

    if (showTitle) {
      ctx.fillStyle = TEXT_COLOR
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      const titleFS = layout.sideLayout ? 34 : GRID_TITLE_FS
      const titleLH = layout.sideLayout ? 38 : GRID_LINE_H
      ctx.font = `bold ${titleFS}px sans-serif`
      // Word-wrap title, max 2 lines; truncate last line if still overflows
      const words = film.title.split(' ')
      let line1 = ''
      let remaining = ''
      for (let w = 0; w < words.length; w++) {
        const test = line1 ? `${line1} ${words[w]}` : words[w]
        if (line1 && ctx.measureText(test).width > maxTextW) {
          remaining = words.slice(w).join(' ')
          break
        }
        line1 = test
      }
      ctx.fillText(line1 || film.title, textX, textY)
      textY += titleLH
      if (remaining) {
        ctx.fillText(truncate(ctx, remaining, maxTextW), textX, textY)
        textY += titleLH
      }
      if (!layout.sideLayout && !remaining) textY += GRID_LINE_GAP
    }

    if (showYear && film.year) {
      ctx.fillStyle = SUBTEXT_COLOR
      ctx.font = layout.sideLayout ? '26px sans-serif' : `${GRID_META_FS}px sans-serif`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText(film.year, textX, textY)
      textY += GRID_LINE_H + GRID_LINE_GAP
    }

    if (showRating && film.rating) {
      ctx.fillStyle = '#FFB020'
      ctx.font = layout.sideLayout ? '30px sans-serif' : `${GRID_META_FS}px sans-serif`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText(film.rating, textX, textY)
      textY += GRID_LINE_H + GRID_LINE_GAP
    }

    // For diary type: show per-film watch date under the rating when showDate is on
    if (cardType === 'recent-diary' && showDate && film.date) {
      ctx.fillStyle = SUBTEXT_COLOR
      ctx.font = layout.sideLayout ? '26px sans-serif' : `${GRID_DATE_FS}px sans-serif`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText(film.date, textX, textY)
    }
  }

  // ── Footer ────────────────────────────────────────────────
  await drawFooter(ctx, layout.footerY, layout.cardWidth, username, footerAvatarDataUrl, showShareIcon)

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

// Draws an iOS-style share icon: upward arrow + open-top box.
// x/y is the top-left corner of the icon's bounding box; size is width and height.
function drawShareIcon(
  ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string,
): void {
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  const cx = x + size / 2
  const tipY  = y + size * 0.08
  const wingY = y + size * 0.30
  const wingX = size * 0.21
  const stemY = y + size * 0.58

  // Arrow head + stem
  ctx.beginPath()
  ctx.moveTo(cx - wingX, wingY)
  ctx.lineTo(cx, tipY)
  ctx.lineTo(cx + wingX, wingY)
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(cx, tipY)
  ctx.lineTo(cx, stemY)
  ctx.stroke()

  // Open-top box (left side, bottom, right side)
  const boxL  = x + size * 0.125
  const boxR  = x + size * 0.875
  const boxT  = y + size * 0.42
  const boxB  = y + size * 0.92

  ctx.beginPath()
  ctx.moveTo(boxL, boxT)
  ctx.lineTo(boxL, boxB)
  ctx.lineTo(boxR, boxB)
  ctx.lineTo(boxR, boxT)
  ctx.stroke()
}

// Draws the card footer.
// Left side always shows the page author: [share icon?] [avatar?] username
//   showShareIcon=false (own profile):  [avatar] username
//   showShareIcon=true  (other/none):   [share icon] [avatar?] username
async function drawFooter(
  ctx: CanvasRenderingContext2D,
  footerY: number,
  cardWidth: number,
  username: string | undefined,
  footerAvatarDataUrl: string | undefined,
  showShareIcon: boolean | undefined,
): Promise<void> {
  const SHARE_SIZE = 24
  const AVATAR_SIZE = 32
  const ICON_GAP = 10

  let x = 40

  if (showShareIcon) {
    drawShareIcon(ctx, x, footerY - SHARE_SIZE / 2, SHARE_SIZE, DIM_COLOR)
    x += SHARE_SIZE + ICON_GAP
  }

  if (username) {
    if (footerAvatarDataUrl) {
      try {
        const avatarImg = await loadImage(footerAvatarDataUrl)
        ctx.save()
        ctx.beginPath()
        ctx.arc(x + AVATAR_SIZE / 2, footerY, AVATAR_SIZE / 2, 0, Math.PI * 2)
        ctx.clip()
        ctx.drawImage(avatarImg, x, footerY - AVATAR_SIZE / 2, AVATAR_SIZE, AVATAR_SIZE)
        ctx.restore()
        x += AVATAR_SIZE + ICON_GAP
      } catch { /* skip avatar on load failure */ }
    }

    ctx.fillStyle = SUBTEXT_COLOR
    ctx.font = '27px sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(username, x, footerY)
  }

  // Right side attribution
  ctx.fillStyle = DIM_COLOR
  ctx.font = '23px sans-serif'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  ctx.fillText('generated by Boxd Card', cardWidth - 40, footerY)
}

export async function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = dataUrl
  })
}
