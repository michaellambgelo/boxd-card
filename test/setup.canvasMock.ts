import { vi } from 'vitest'

// Mock Canvas API (jsdom does not implement 2D context).
//
// This file is loaded by the DEFAULT vitest project only. The `visual` project
// deliberately omits it and loads test/canvasEnv.ts instead, so that the golden
// image suite rasterizes for real through node-canvas.
//
// Note what this mock costs: measureText is pinned to a constant 80, so every
// structural test that exercises wrapText() is measuring against a fiction.
// Real metrics wrap differently. If the visual suite disagrees with a
// structural test about where text breaks, the visual suite is the one telling
// the truth.
const mockCtx = {
  fillStyle: '',
  font: '',
  textAlign: '',
  textBaseline: '',
  filter: '',
  fillRect: vi.fn(),
  drawImage: vi.fn(),
  fillText: vi.fn(),
  fill: vi.fn(),
  stroke: vi.fn(),
  measureText: vi.fn(() => ({ width: 80 })),
  createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  save: vi.fn(),
  restore: vi.fn(),
  clip: vi.fn(),
  beginPath: vi.fn(),
  closePath: vi.fn(),
  rect: vi.fn(),
  roundRect: vi.fn(),
  arc: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
}

Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  value: vi.fn(() => mockCtx),
  writable: true,
})

Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
  value: vi.fn((callback: BlobCallback) => {
    callback(new Blob(['mock-png'], { type: 'image/png' }))
  }),
  writable: true,
})
