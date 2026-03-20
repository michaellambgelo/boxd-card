import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { FetchImageRequest, FetchImageResponse } from './service-worker'

// Capture the registered listener after the module is imported
let listener: (
  message: FetchImageRequest,
  sender: chrome.runtime.MessageSender,
  sendResponse: (r: FetchImageResponse) => void
) => boolean | undefined

beforeEach(async () => {
  vi.resetModules()
  // Re-import so onMessage.addListener is called fresh
  await import('./service-worker')
  const calls = (chrome.runtime.onMessage.addListener as ReturnType<typeof vi.fn>).mock.calls
  listener = calls[calls.length - 1][0]
})

afterEach(() => {
  vi.restoreAllMocks()
})

function makeBlob(content = 'fake-image'): Blob {
  return new Blob([content], { type: 'image/jpeg' })
}

describe('service-worker FETCH_IMAGE handler', () => {
  it('returns a dataUrl on successful fetch', async () => {
    const blob = makeBlob()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(blob) }))

    // Mock FileReader to immediately fire onloadend with a data URL
    const mockDataUrl = 'data:image/jpeg;base64,ZmFrZS1pbWFnZQ=='
    vi.stubGlobal('FileReader', class {
      result = mockDataUrl
      readAsDataURL() { this.onloadend?.() }
      onloadend?: () => void
    })

    const sendResponse = vi.fn()
    listener({ type: 'FETCH_IMAGE', url: 'https://a.ltrbxd.com/poster.jpg' }, {}, sendResponse)

    // Wait for the async chain to complete
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledOnce())
    expect(sendResponse).toHaveBeenCalledWith({ dataUrl: mockDataUrl })
  })

  it('returns an error when the HTTP response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }))

    const sendResponse = vi.fn()
    listener({ type: 'FETCH_IMAGE', url: 'https://a.ltrbxd.com/missing.jpg' }, {}, sendResponse)

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledOnce())
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('404') })
    )
  })

  it('returns an error on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

    const sendResponse = vi.fn()
    listener({ type: 'FETCH_IMAGE', url: 'https://a.ltrbxd.com/poster.jpg' }, {}, sendResponse)

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledOnce())
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('Network error') })
    )
  })
})
