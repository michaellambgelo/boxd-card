import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type {
  FetchImageRequest,
  FetchImageResponse,
  FetchTmdbRequest,
  FetchTmdbResponse,
} from './service-worker'

// Capture the registered listener after the module is imported
type Message = FetchImageRequest | FetchTmdbRequest
type Response = FetchImageResponse | FetchTmdbResponse
let listener: (
  message: Message,
  sender: chrome.runtime.MessageSender,
  sendResponse: (r: Response) => void
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

describe('service-worker FETCH_TMDB handler', () => {
  it('returns data: null immediately without fetching when slug is empty', async () => {
    const mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)

    const sendResponse = vi.fn()
    listener({ type: 'FETCH_TMDB', slug: '' }, {}, sendResponse)

    expect(sendResponse).toHaveBeenCalledWith({ data: null })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('calls the Cloudflare Worker /tmdb endpoint with the URL-encoded slug', async () => {
    const body = {
      tmdbId: 438631,
      type: 'movie',
      title: 'Dune',
      releaseDate: '2021-09-15',
      runtime: 155,
      overview: 'Paul Atreides...',
      director: 'Denis Villeneuve',
      genres: ['Science Fiction'],
      posterUrl: 'https://image.tmdb.org/t/p/original/p.jpg',
      backdropUrl: 'https://image.tmdb.org/t/p/original/b.jpg',
    }
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', mockFetch)

    const sendResponse = vi.fn()
    listener({ type: 'FETCH_TMDB', slug: 'some film' }, {}, sendResponse)

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledOnce())
    const [calledUrl] = mockFetch.mock.calls[0]
    expect(String(calledUrl)).toBe(
      'https://boxd-card.michaellamb.workers.dev/tmdb?slug=some%20film',
    )
    expect(sendResponse).toHaveBeenCalledWith({ data: body })
  })

  it('returns data: null on 404 (no TMDB mapping)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('not found', { status: 404 }),
    ))

    const sendResponse = vi.fn()
    listener({ type: 'FETCH_TMDB', slug: 'unknown-film' }, {}, sendResponse)

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledOnce())
    expect(sendResponse).toHaveBeenCalledWith({ data: null })
  })

  it('returns an error on non-404 failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('upstream', { status: 502 }),
    ))

    const sendResponse = vi.fn()
    listener({ type: 'FETCH_TMDB', slug: 'dune-2021' }, {}, sendResponse)

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledOnce())
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('502') }),
    )
  })

  it('returns an error on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Offline')))

    const sendResponse = vi.fn()
    listener({ type: 'FETCH_TMDB', slug: 'dune-2021' }, {}, sendResponse)

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledOnce())
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('Offline') }),
    )
  })
})
