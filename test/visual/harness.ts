// Shared render plumbing for the studio and the golden suite.
//
// Both go through renderCard() — the same function the extension, the web app
// and the popup preview call. That is the whole point: a studio that rendered
// cards its own way could show you something the product never produces.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { CardOptions } from '../../src/canvas/renderCard'
import { renderCard } from '../../src/canvas/renderCard'

export interface RenderedCard {
  name: string
  buffer: Buffer
  width: number
  height: number
}

/** PNG IHDR carries width and height as big-endian uint32 at bytes 16 and 20. */
export function pngSize(buf: Buffer): { width: number; height: number } {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

export async function renderToBuffer(options: CardOptions): Promise<Buffer> {
  const blob = await renderCard(options)
  return Buffer.from(await blob.arrayBuffer())
}

export async function renderNamed(name: string, options: CardOptions): Promise<RenderedCard> {
  const buffer = await renderToBuffer(options)
  const { width, height } = pngSize(buffer)
  return { name, buffer, width, height }
}

export function writeFile(path: string, buf: Buffer): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, buf)
}

/**
 * Lay every rendered card out on one sheet, scaled to a common cell, with its
 * name under it. One glance is meant to answer "did anything break?" — which is
 * the only reason the studio is worth having over a directory of PNGs.
 */
export async function contactSheet(
  cards: RenderedCard[],
  opts: { columns?: number; cellW?: number; cellH?: number } = {},
): Promise<Buffer> {
  const { columns = 6, cellW = 320, cellH = 320 } = opts
  const LABEL_H = 34
  const PAD = 18
  const rows = Math.ceil(cards.length / columns)
  const width = PAD + columns * (cellW + PAD)
  const height = PAD + rows * (cellH + LABEL_H + PAD)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#101418'
  ctx.fillRect(0, 0, width, height)

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i]
    const col = i % columns
    const row = Math.floor(i / columns)
    const cx = PAD + col * (cellW + PAD)
    const cy = PAD + row * (cellH + LABEL_H + PAD)

    // Contain the card in the cell, never upscale past 1:1.
    const scale = Math.min(cellW / card.width, cellH / card.height, 1)
    const w = Math.round(card.width * scale)
    const h = Math.round(card.height * scale)
    const x = cx + Math.round((cellW - w) / 2)
    const y = cy + Math.round((cellH - h) / 2)

    ctx.fillStyle = '#181d23'
    ctx.fillRect(cx, cy, cellW, cellH)

    const img = await loadBuffer(card.buffer)
    ctx.drawImage(img, x, y, w, h)

    ctx.fillStyle = '#9ab'
    ctx.font = '15px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(card.name, cx + cellW / 2, cy + cellH + 8, cellW)

    ctx.fillStyle = '#566'
    ctx.font = '12px sans-serif'
    ctx.fillText(`${card.width}x${card.height}`, cx + cellW / 2, cy + cellH + 26, cellW)
  }

  const dataUrl = canvas.toDataURL('image/png')
  return Buffer.from(dataUrl.split(',')[1], 'base64')
}

function loadBuffer(buf: Buffer): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('contact sheet: failed to decode a rendered card'))
    img.src = `data:image/png;base64,${buf.toString('base64')}`
  })
}
