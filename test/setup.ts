import { vi } from 'vitest'

// Mock Chrome extension APIs before any module imports them
const mockMessageListeners: Array<(...args: unknown[]) => unknown> = []

globalThis.chrome = {
  runtime: {
    onMessage: {
      addListener: vi.fn((fn) => mockMessageListeners.push(fn)),
    },
    sendMessage: vi.fn(),
  },
  tabs: {
    query: vi.fn(),
    sendMessage: vi.fn(),
  },
} as unknown as typeof chrome

// Mock Canvas API (jsdom does not implement 2D context)
const mockCtx = {
  fillStyle: '',
  font: '',
  textAlign: '',
  textBaseline: '',
  fillRect: vi.fn(),
  drawImage: vi.fn(),
  fillText: vi.fn(),
  measureText: vi.fn(() => ({ width: 80 })),
  save: vi.fn(),
  restore: vi.fn(),
  clip: vi.fn(),
  beginPath: vi.fn(),
  roundRect: vi.fn(),
  arc: vi.fn(),
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
