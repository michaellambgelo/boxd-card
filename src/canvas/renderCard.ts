import type { CardType, ListCount, ReviewCount } from '../types'
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

const HEADER_H    = 90
const POSTER_TOP  = 110  // = HEADER_H + 20
const TEXT_AREA_H = 100  // space below each poster for title + rating + date

// Font sizes for poster-grid card text (title/rating/date under each poster)
const GRID_TITLE_FS    = 24
const GRID_META_FS     = 24
const GRID_DATE_FS     = 21
const GRID_LINE_H      = 28  // line height for 24px text
const GRID_DATE_LINE_H = 25  // line height for 21px text
const GRID_LINE_GAP    =  4  // gap between consecutive text lines
const GRID_TEXT_PAD    = 10  // top padding above first text item

/**
 * Compute card layout geometry based on film count and optional title area height.
 * filmCount ≤ 4: single row of 4 at 200px each (base 1200×590)
 * filmCount 5–20: 5-column grid, 208px posters, taller card
 * titleAreaH: extra vertical space between header and posters (list title/description)
 */
export function computeLayout(filmCount: number, titleAreaH = 0): CardLayout {
  if (filmCount <= 4) {
    const posterW = 200
    const posterH = 300
    const posterGap = 20
    const effectiveCols = Math.max(1, filmCount)
    const totalPosterW = effectiveCols * posterW + (effectiveCols - 1) * posterGap
    const posterLeft = Math.floor((1200 - totalPosterW) / 2)
    const footerY = POSTER_TOP + posterH + TEXT_AREA_H + 56 + titleAreaH
    return {
      cardWidth: 1200, cardHeight: footerY + 64,
      posterW, posterH, posterGap,
      posterLeft,
      posterTop: POSTER_TOP + titleAreaH,
      cols: effectiveCols, rows: 1,
      footerY,
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
  const pt = POSTER_TOP + titleAreaH
  const footerY = pt + rows * rowH + 56
  const cardHeight = footerY + 64

  return {
    cardWidth: 1200, cardHeight,
    posterW, posterH, posterGap: 20,
    posterLeft: 40,
    posterTop: pt,
    cols, rows,
    footerY,
    textAreaH: TEXT_AREA_H,
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
    // Draw oversized to avoid transparent fringe from the blur kernel.
    const pad = BACKDROP_BLUR * 3
    ctx.filter = `blur(${BACKDROP_BLUR}px)`
    ctx.drawImage(img, -pad, -pad, width + pad * 2, height + pad * 2)
    ctx.filter = 'none'
    // Dark overlay so text and other content remain legible.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.72)'
    ctx.fillRect(0, 0, width, height)
  } catch {
    // Solid fallback already in place.
  }
}

// ── Review card layout constants ─────────────────────────────────────────────
const RV_POSTER_W      = 200
const RV_POSTER_H      = 300
const RV_POSTER_X      = 40
const RV_CONTENT_X     = RV_POSTER_X + RV_POSTER_W + 30  // 270
const RV_CONTENT_W     = 1200 - RV_CONTENT_X - 40        // 890
const RV_TITLE_H       = 54   // bold 39px title line height
const RV_META_H        = 45   // rating / date line height
const RV_META_GAP      = 9    // gap between consecutive meta lines
const RV_REVIEW_FS     = 30   // review text font-size (px)
const RV_REVIEW_LINE_H = 42   // review text line height
const RV_TOP_PAD       = 28   // gap below header, above first review
const RV_ROW_GAP       = 28   // gap between consecutive review rows
const RV_FOOTER_GAP    = 44   // gap below last review, above footer

interface ReviewRowMeasure {
  y: number
  rowH: number
}

/** Measure each review row's height without drawing anything. */
function measureReviewRows(
  films: FilmEntry[],
  count: number,
  showTitle: boolean,
  showRating: boolean,
  showDate: boolean,
  showTags: boolean,
  measureCtx: CanvasRenderingContext2D,
): { rows: ReviewRowMeasure[]; footerY: number; cardHeight: number } {
  const rows: ReviewRowMeasure[] = []
  let currentY = HEADER_H + RV_TOP_PAD

  for (let i = 0; i < count; i++) {
    const film = films[i]
    let contentH = 0
    let firstMeta = true

    function addMetaLine(lineH: number) {
      if (!firstMeta) contentH += RV_META_GAP
      contentH += lineH
      firstMeta = false
    }

    if (showTitle) addMetaLine(RV_TITLE_H)
    if (showRating && film.rating) addMetaLine(RV_META_H)
    if (showDate && film.date) addMetaLine(RV_META_H)
    if (showTags && film.tags?.length) {
      const tagsH = drawTagPills(measureCtx, film.tags, 0, 0, RV_CONTENT_W, false)
      if (!firstMeta) contentH += RV_META_GAP
      contentH += tagsH
      firstMeta = false
    }

    if (film.reviewText) {
      if (!firstMeta) contentH += 21  // gap before review text
      measureCtx.font = `${RV_REVIEW_FS}px sans-serif`
      contentH += wrapText(measureCtx, film.reviewText, 0, 0, RV_CONTENT_W, RV_REVIEW_LINE_H, false)
    }

    const rowH = Math.max(RV_POSTER_H, contentH)
    rows.push({ y: currentY, rowH })
    currentY += rowH + (i < count - 1 ? RV_ROW_GAP : 0)
  }

  const footerY = currentY + RV_FOOTER_GAP
  return { rows, footerY, cardHeight: footerY + 64 }
}

const LIST_PADDING = 12
const LIST_TITLE_H = 32
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
    const count = Math.min(films.length, reviewCount ?? 1)
    if (count === 0) throw new Error('No films found to render.')

    // Pass 1: measure row heights using a temporary canvas
    const measureCanvas = document.createElement('canvas')
    const measureCtx = measureCanvas.getContext('2d')!
    const { rows, footerY, cardHeight } = measureReviewRows(
      films, count, showTitle, showRating, showDate, showTags ?? false, measureCtx
    )

    // Pass 2: draw
    const canvas = document.createElement('canvas')
    canvas.width  = 1200
    canvas.height = cardHeight
    const ctx = canvas.getContext('2d')!

    await drawBackground(ctx, 1200, cardHeight, backdropDataUrl)

    await drawLogo(ctx, 40, HEADER_H / 2)

    for (let i = 0; i < count; i++) {
      const film = films[i]
      const rowY = rows[i].y

      // Poster
      try {
        const img = await loadImage(film.posterDataUrl)
        ctx.drawImage(img, RV_POSTER_X, rowY, RV_POSTER_W, RV_POSTER_H)
      } catch {
        ctx.fillStyle = '#333344'
        ctx.fillRect(RV_POSTER_X, rowY, RV_POSTER_W, RV_POSTER_H)
      }

      // Right column
      let contentY = rowY
      let firstMeta = true

      function drawMetaLine(lineH: number, drawFn: () => void) {
        if (!firstMeta) contentY += RV_META_GAP
        drawFn()
        contentY += lineH
        firstMeta = false
      }

      if (showTitle) {
        drawMetaLine(RV_TITLE_H, () => {
          const displayTitle = showYear && film.year
            ? `${film.title} (${film.year})`
            : film.title
          ctx.fillStyle = TEXT_COLOR
          ctx.font = 'bold 39px sans-serif'
          ctx.textAlign = 'left'
          ctx.textBaseline = 'top'
          ctx.fillText(truncate(ctx, displayTitle, RV_CONTENT_W), RV_CONTENT_X, contentY)
        })
      }

      if (showRating && film.rating) {
        drawMetaLine(RV_META_H, () => {
          ctx.fillStyle = '#FFB020'
          ctx.font = '35px sans-serif'
          ctx.textAlign = 'left'
          ctx.textBaseline = 'top'
          ctx.fillText(film.rating, RV_CONTENT_X, contentY)
        })
      }

      if (showDate && film.date) {
        drawMetaLine(RV_META_H, () => {
          ctx.fillStyle = SUBTEXT_COLOR
          ctx.font = '32px sans-serif'
          ctx.textAlign = 'left'
          ctx.textBaseline = 'top'
          ctx.fillText(film.date!, RV_CONTENT_X, contentY)
        })
      }

      if (showTags && film.tags?.length) {
        if (!firstMeta) contentY += RV_META_GAP
        contentY += drawTagPills(ctx, film.tags, RV_CONTENT_X, contentY, RV_CONTENT_W, true)
        firstMeta = false
      }

      if (film.reviewText) {
        if (!firstMeta) contentY += 21
        ctx.fillStyle = TEXT_COLOR
        ctx.font = `${RV_REVIEW_FS}px sans-serif`
        ctx.textAlign = 'left'
        ctx.textBaseline = 'top'
        wrapText(ctx, film.reviewText, RV_CONTENT_X, contentY, RV_CONTENT_W, RV_REVIEW_LINE_H, true)
      }
    }

    // Footer
    await drawFooter(ctx, footerY, 1200, username, footerAvatarDataUrl, showShareIcon)

    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => { if (blob) resolve(blob); else reject(new Error('canvas.toBlob returned null')) },
        'image/png'
      )
    })
  }

  // ── Poster-grid cards (existing logic) ───────────────────────────────────
  const filmCount = Math.min(
    films.length,
    (cardType === 'list' || cardType === 'recent-diary') ? (listCount ?? 4) : 4,
  )

  if (filmCount === 0) {
    throw new Error('No films found to render.')
  }

  const showingListTitle = cardType === 'list' && !!showListTitle && !!listTitle
  const showingListDesc  = cardType === 'list' && !!showListDescription && !!listDescription
  const showingCardTypeLabel = cardType !== 'list' && !!showCardTypeLabel && !!cardTypeLabel
  const showingListTags  = cardType === 'list' && !!showTags && !!listTags?.length

  // Measure list-tag pill height before computing layout (needs a canvas context)
  let listTagsAreaH = 0
  if (showingListTags && listTags) {
    const mCanvas = document.createElement('canvas')
    const mCtx = mCanvas.getContext('2d')!
    listTagsAreaH = LIST_PADDING + drawTagPills(mCtx, listTags, 0, 0, 1200 - 80, false)
  }

  const titleAreaH = (showingListTitle || showingListDesc || showingCardTypeLabel || showingListTags)
    ? LIST_PADDING
      + (showingListTitle || showingCardTypeLabel ? LIST_TITLE_H : 0)
      + (showingListDesc  ? LIST_DESC_H  : 0)
      + listTagsAreaH
      + LIST_BOTTOM
    : 0

  const layout = computeLayout(filmCount, titleAreaH)

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
    ctx.font = 'bold 30px sans-serif'
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
    ctx.font = 'bold 30px sans-serif'
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
    const y = layout.posterTop  + row * (layout.posterH + layout.textAreaH)

    try {
      const img = await loadImage(film.posterDataUrl)
      ctx.drawImage(img, x, y, layout.posterW, layout.posterH)
    } catch {
      ctx.fillStyle = '#333344'
      ctx.fillRect(x, y, layout.posterW, layout.posterH)
    }

    let textY = y + layout.posterH + GRID_TEXT_PAD

    if (showTitle) {
      const displayTitle = showYear && film.year
        ? `${film.title} (${film.year})`
        : film.title
      ctx.fillStyle = TEXT_COLOR
      ctx.font = `${GRID_TITLE_FS}px sans-serif`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText(truncate(ctx, displayTitle, layout.posterW), x, textY)
      textY += GRID_LINE_H + GRID_LINE_GAP
    }

    if (showRating && film.rating) {
      ctx.fillStyle = '#FFB020'
      ctx.font = `${GRID_META_FS}px sans-serif`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText(film.rating, x, textY)
      textY += GRID_LINE_H + GRID_LINE_GAP
    }

    // For diary type: show per-film watch date under the rating when showDate is on
    if (cardType === 'recent-diary' && showDate && film.date) {
      ctx.fillStyle = SUBTEXT_COLOR
      ctx.font = `${GRID_DATE_FS}px sans-serif`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText(film.date, x, textY)
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
