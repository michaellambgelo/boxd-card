// Per-pixel comparison for the golden suite. No new dependency: node-canvas is
// already here and decodes PNG, so the diff is a loop over ImageData.
import { createCanvas, Image as NodeImage } from 'canvas'

export interface DiffResult {
  equal: boolean
  reason?: string
  diffPixels: number
  totalPixels: number
  ratio: number
  /** PNG bytes highlighting every differing pixel in magenta, when they differ. */
  diffPng?: Buffer
}

/** Per-channel difference above this counts as a differing pixel. */
const CHANNEL_TOLERANCE = 8
/** Fraction of differing pixels tolerated before a golden is considered moved. */
const MAX_RATIO = 0.0005

function decode(buf: Buffer) {
  const img = new NodeImage()
  img.src = buf
  const canvas = createCanvas(img.width, img.height)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0)
  return { ctx, width: img.width, height: img.height }
}

export function comparePng(actual: Buffer, expected: Buffer): DiffResult {
  // Byte equality is the common case and needs no decode.
  if (actual.equals(expected)) {
    return { equal: true, diffPixels: 0, totalPixels: 0, ratio: 0 }
  }

  const a = decode(actual)
  const e = decode(expected)

  // Dimensions first: a size change is a layout change, and comparing pixels
  // across different sizes would report a meaningless number.
  if (a.width !== e.width || a.height !== e.height) {
    return {
      equal: false,
      reason: `dimensions changed: expected ${e.width}x${e.height}, got ${a.width}x${a.height}`,
      diffPixels: 0,
      totalPixels: 0,
      ratio: 1,
    }
  }

  const ad = a.ctx.getImageData(0, 0, a.width, a.height)
  const ed = e.ctx.getImageData(0, 0, e.width, e.height)
  const total = a.width * a.height

  const out = createCanvas(a.width, a.height)
  const outCtx = out.getContext('2d')
  const od = outCtx.createImageData(a.width, a.height)

  let diff = 0
  for (let i = 0; i < ad.data.length; i += 4) {
    const dr = Math.abs(ad.data[i] - ed.data[i])
    const dg = Math.abs(ad.data[i + 1] - ed.data[i + 1])
    const db = Math.abs(ad.data[i + 2] - ed.data[i + 2])
    const da = Math.abs(ad.data[i + 3] - ed.data[i + 3])
    if (dr > CHANNEL_TOLERANCE || dg > CHANNEL_TOLERANCE || db > CHANNEL_TOLERANCE || da > CHANNEL_TOLERANCE) {
      diff++
      od.data[i] = 255; od.data[i + 1] = 0; od.data[i + 2] = 255; od.data[i + 3] = 255
    } else {
      // Keep the actual image, dimmed, so the highlights have context.
      od.data[i] = ad.data[i] >> 2
      od.data[i + 1] = ad.data[i + 1] >> 2
      od.data[i + 2] = ad.data[i + 2] >> 2
      od.data[i + 3] = 255
    }
  }

  const ratio = diff / total
  if (ratio <= MAX_RATIO) {
    return { equal: true, diffPixels: diff, totalPixels: total, ratio }
  }

  outCtx.putImageData(od, 0, 0)
  return {
    equal: false,
    reason: `${diff} of ${total} pixels differ (${(ratio * 100).toFixed(3)}%)`,
    diffPixels: diff,
    totalPixels: total,
    ratio,
    diffPng: out.toBuffer('image/png'),
  }
}
