import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchTmdbData, slugFromPosterUrl } from './tmdbClient'

describe('slugFromPosterUrl', () => {
  it('extracts slug from a /film/<slug>/image-NNN/ URL', () => {
    expect(slugFromPosterUrl('https://letterboxd.com/film/dune-2021/image-150/'))
      .toBe('dune-2021')
  })

  it('extracts slug from a bare /film/<slug>/ URL', () => {
    expect(slugFromPosterUrl('https://letterboxd.com/film/groundhog-day/'))
      .toBe('groundhog-day')
  })

  it('returns empty string when URL does not match', () => {
    expect(slugFromPosterUrl('https://letterboxd.com/user/dune/')).toBe('')
    expect(slugFromPosterUrl('')).toBe('')
    expect(slugFromPosterUrl('not-a-url')).toBe('')
  })
})

describe('fetchTmdbData', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('returns null when the slug is empty without fetching', async () => {
    const mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)
    expect(await fetchTmdbData('')).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('returns null on 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('not found', { status: 404 }),
    ))
    expect(await fetchTmdbData('unknown-film')).toBeNull()
    vi.unstubAllGlobals()
  })

  it('throws on non-404 error responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('upstream', { status: 502 }),
    ))
    await expect(fetchTmdbData('dune-2021')).rejects.toThrow(/502/)
    vi.unstubAllGlobals()
  })

  it('returns parsed JSON on 200', async () => {
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
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ))
    const result = await fetchTmdbData('dune-2021')
    expect(result).toEqual(body)
    vi.unstubAllGlobals()
  })

  it('encodes the slug as a query param', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ tmdbId: 1 }), { status: 200 }),
    )
    vi.stubGlobal('fetch', mockFetch)
    await fetchTmdbData('some film')
    expect(mockFetch).toHaveBeenCalledOnce()
    const [calledUrl] = mockFetch.mock.calls[0]
    expect(String(calledUrl)).toContain('slug=some%20film')
    vi.unstubAllGlobals()
  })
})
