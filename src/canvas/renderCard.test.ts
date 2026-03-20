import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderCard, loadImage } from './renderCard'

const MOCK_OPTIONS = {
  films: [
    { title: 'Dune', rating: '★★★★', posterDataUrl: 'data:image/png;base64,abc' },
    { title: 'Arrival', rating: '★★★★★', posterDataUrl: 'data:image/png;base64,def' },
    { title: 'Blade Runner 2049', rating: '★★★★½', posterDataUrl: 'data:image/png;base64,ghi' },
    { title: 'Annihilation', rating: '★★★★', posterDataUrl: 'data:image/png;base64,jkl' },
  ],
  username: 'michaellamb',
  showDate: true,
}

describe('renderCard', () => {
  it('resolves to a Blob', async () => {
    const blob = await renderCard(MOCK_OPTIONS)
    expect(blob).toBeInstanceOf(Blob)
  })

  it('returns a PNG blob', async () => {
    const blob = await renderCard(MOCK_OPTIONS)
    expect(blob.type).toBe('image/png')
  })

  it('resolves even with showDate false', async () => {
    const blob = await renderCard({ ...MOCK_OPTIONS, showDate: false })
    expect(blob).toBeInstanceOf(Blob)
  })
})

describe('loadImage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function makeMockImageClass() {
    let captured: { onload?: () => void; onerror?: (err?: unknown) => void; src?: string } | null = null
    class MockImage {
      onload?: () => void
      onerror?: (err?: unknown) => void
      src?: string
      constructor() { captured = this as unknown as typeof captured }
    }
    return { MockImage, getCapture: () => captured }
  }

  it('resolves when the image loads', async () => {
    const { MockImage, getCapture } = makeMockImageClass()
    vi.stubGlobal('Image', MockImage as unknown as typeof Image)

    const promise = loadImage('data:image/png;base64,abc')
    getCapture()!.onload?.()

    const result = await promise
    expect(result).toBe(getCapture())
  })

  it('rejects when the image errors', async () => {
    const { MockImage, getCapture } = makeMockImageClass()
    vi.stubGlobal('Image', MockImage as unknown as typeof Image)

    const promise = loadImage('data:image/png;base64,INVALID')
    getCapture()!.onerror?.(new Event('error'))

    await expect(promise).rejects.toBeInstanceOf(Event)
  })
})
