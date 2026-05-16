import { describe, it, expect, vi, beforeEach } from 'vitest'
import worker from './index'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(
  url: string,
  method = 'GET',
): Request {
  return new Request(url, { method })
}

interface TestEnv { TMDB_API_KEY: string }

function workerFetch(
  request: Request,
  env: TestEnv = { TMDB_API_KEY: '' },
): Promise<Response> {
  return worker.fetch(request, env)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Cloudflare Worker proxy', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  // ── OPTIONS preflight ───────────────────────────────────────────────────

  describe('OPTIONS preflight', () => {
    it('returns 204 with CORS headers', async () => {
      const res = await workerFetch(makeRequest('http://localhost:8787/', 'OPTIONS'))
      expect(res.status).toBe(204)
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
      expect(res.headers.get('Access-Control-Allow-Methods')).toContain('GET')
      expect(res.headers.get('Access-Control-Allow-Headers')).toContain('Content-Type')
      expect(res.headers.get('Access-Control-Max-Age')).toBe('86400')
    })
  })

  // ── Method validation ───────────────────────────────────────────────────

  describe('method validation', () => {
    it('returns 405 for POST requests', async () => {
      const res = await workerFetch(makeRequest('http://localhost:8787/?url=https://letterboxd.com/', 'POST'))
      expect(res.status).toBe(405)
    })

    it('returns 405 for PUT requests', async () => {
      const res = await workerFetch(makeRequest('http://localhost:8787/?url=https://letterboxd.com/', 'PUT'))
      expect(res.status).toBe(405)
    })

    it('returns 405 for DELETE requests', async () => {
      const res = await workerFetch(makeRequest('http://localhost:8787/?url=https://letterboxd.com/', 'DELETE'))
      expect(res.status).toBe(405)
    })
  })

  // ── Missing/invalid url param ───────────────────────────────────────────

  describe('url parameter validation', () => {
    it('returns 400 when url param is missing', async () => {
      const res = await workerFetch(makeRequest('http://localhost:8787/'))
      expect(res.status).toBe(400)
      const body = await res.text()
      expect(body).toContain('url')
    })

    it('returns 400 for invalid URL', async () => {
      const res = await workerFetch(makeRequest('http://localhost:8787/?url=not-a-url'))
      expect(res.status).toBe(400)
      const body = await res.text()
      expect(body).toContain('Invalid')
    })

    it('returns 400 for non-https target', async () => {
      const res = await workerFetch(
        makeRequest('http://localhost:8787/?url=' + encodeURIComponent('http://letterboxd.com/'))
      )
      expect(res.status).toBe(400)
      const body = await res.text()
      expect(body).toContain('https')
    })
  })

  // ── Host allowlist ──────────────────────────────────────────────────────

  describe('host allowlist', () => {
    it('returns 403 for disallowed host (google.com)', async () => {
      const res = await workerFetch(
        makeRequest('http://localhost:8787/?url=' + encodeURIComponent('https://google.com/'))
      )
      expect(res.status).toBe(403)
      const body = await res.text()
      expect(body).toContain('not allowed')
    })

    it('returns 403 for evil.com', async () => {
      const res = await workerFetch(
        makeRequest('http://localhost:8787/?url=' + encodeURIComponent('https://evil.com/'))
      )
      expect(res.status).toBe(403)
    })

    it('allows letterboxd.com', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        new Response('ok', { status: 200, headers: { 'Content-Type': 'text/html' } })
      ))
      const res = await workerFetch(
        makeRequest('http://localhost:8787/?url=' + encodeURIComponent('https://letterboxd.com/user/'))
      )
      expect(res.status).toBe(200)
      vi.unstubAllGlobals()
    })

    it('allows a.ltrbxd.com', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        new Response('image-data', { status: 200, headers: { 'Content-Type': 'image/jpeg' } })
      ))
      const res = await workerFetch(
        makeRequest('http://localhost:8787/?url=' + encodeURIComponent('https://a.ltrbxd.com/poster.jpg'))
      )
      expect(res.status).toBe(200)
      vi.unstubAllGlobals()
    })

    it('allows s.ltrbxd.com', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        new Response('static-data', { status: 200, headers: { 'Content-Type': 'text/css' } })
      ))
      const res = await workerFetch(
        makeRequest('http://localhost:8787/?url=' + encodeURIComponent('https://s.ltrbxd.com/static/file.css'))
      )
      expect(res.status).toBe(200)
      vi.unstubAllGlobals()
    })

    it('allows subdomains of letterboxd.com', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        new Response('ok', { status: 200, headers: { 'Content-Type': 'text/html' } })
      ))
      const res = await workerFetch(
        makeRequest('http://localhost:8787/?url=' + encodeURIComponent('https://api.letterboxd.com/data'))
      )
      expect(res.status).toBe(200)
      vi.unstubAllGlobals()
    })

    it('rejects hosts that merely contain an allowed hostname', async () => {
      // e.g., "fakeletterboxd.com" should not match "letterboxd.com"
      const res = await workerFetch(
        makeRequest('http://localhost:8787/?url=' + encodeURIComponent('https://fakeletterboxd.com/'))
      )
      expect(res.status).toBe(403)
    })
  })

  // ── Successful proxy ────────────────────────────────────────────────────

  describe('successful proxy', () => {
    it('returns proxied content with CORS headers', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        new Response('<html>page content</html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        })
      ))

      const res = await workerFetch(
        makeRequest('http://localhost:8787/?url=' + encodeURIComponent('https://letterboxd.com/user/'))
      )
      expect(res.status).toBe(200)
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
      expect(res.headers.get('Content-Type')).toBe('text/html; charset=utf-8')
      expect(res.headers.get('Cache-Control')).toBe('public, max-age=60')

      const body = await res.text()
      expect(body).toBe('<html>page content</html>')

      vi.unstubAllGlobals()
    })

    it('passes upstream status code through', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        new Response('Not Found', { status: 404, headers: { 'Content-Type': 'text/html' } })
      ))

      const res = await workerFetch(
        makeRequest('http://localhost:8787/?url=' + encodeURIComponent('https://letterboxd.com/nonexistent/'))
      )
      expect(res.status).toBe(404)
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')

      vi.unstubAllGlobals()
    })

    it('sends correct User-Agent to upstream', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response('ok', { status: 200, headers: { 'Content-Type': 'text/html' } })
      )
      vi.stubGlobal('fetch', mockFetch)

      await workerFetch(
        makeRequest('http://localhost:8787/?url=' + encodeURIComponent('https://letterboxd.com/user/'))
      )

      expect(mockFetch).toHaveBeenCalledOnce()
      const [, init] = mockFetch.mock.calls[0]
      expect(init.headers['User-Agent']).toContain('BoxdCard-Web')
      expect(init.headers['Accept-Encoding']).toBe('gzip, deflate, br')

      vi.unstubAllGlobals()
    })

    it('follows redirects', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response('ok', { status: 200, headers: { 'Content-Type': 'text/html' } })
      )
      vi.stubGlobal('fetch', mockFetch)

      await workerFetch(
        makeRequest('http://localhost:8787/?url=' + encodeURIComponent('https://letterboxd.com/user/'))
      )

      const [, init] = mockFetch.mock.calls[0]
      expect(init.redirect).toBe('follow')

      vi.unstubAllGlobals()
    })
  })

  // ── Upstream failure ────────────────────────────────────────────────────

  describe('upstream failure', () => {
    it('returns 502 when upstream fetch throws', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Connection refused')))

      const res = await workerFetch(
        makeRequest('http://localhost:8787/?url=' + encodeURIComponent('https://letterboxd.com/user/'))
      )
      expect(res.status).toBe(502)
      const body = await res.text()
      expect(body).toContain('Connection refused')

      vi.unstubAllGlobals()
    })
  })

  // ── Content-Type passthrough ────────────────────────────────────────────

  describe('content-type passthrough', () => {
    it('defaults to application/octet-stream when upstream Content-Type is null', async () => {
      // Create a mock response whose headers.get('Content-Type') returns null
      const mockUpstream = {
        ok: true,
        status: 200,
        headers: { get: (name: string) => name === 'Content-Type' ? null : null },
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)),
      }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockUpstream))

      const res = await workerFetch(
        makeRequest('http://localhost:8787/?url=' + encodeURIComponent('https://letterboxd.com/user/'))
      )
      expect(res.headers.get('Content-Type')).toBe('application/octet-stream')

      vi.unstubAllGlobals()
    })
  })

  // ── TMDB image CDN is allowlisted ───────────────────────────────────────

  describe('host allowlist: image.tmdb.org', () => {
    it('allows image.tmdb.org through the proxy', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        new Response('image-data', { status: 200, headers: { 'Content-Type': 'image/jpeg' } })
      ))
      const res = await workerFetch(
        makeRequest('http://localhost:8787/?url=' + encodeURIComponent('https://image.tmdb.org/t/p/original/poster.jpg') + '&accept=image')
      )
      expect(res.status).toBe(200)
      vi.unstubAllGlobals()
    })
  })

  // ── /tmdb endpoint ──────────────────────────────────────────────────────

  describe('/tmdb endpoint', () => {
    const happyHtml = '<!DOCTYPE html><html><body class="x" data-tmdb-id="438631" data-tmdb-type="movie"><p>Dune</p></body></html>'
    const happyTmdb = {
      title: 'Dune',
      release_date: '2021-09-15',
      runtime: 155,
      overview: 'Paul Atreides...',
      poster_path: '/poster.jpg',
      backdrop_path: '/backdrop.jpg',
      genres: [{ id: 1, name: 'Science Fiction' }, { id: 2, name: 'Adventure' }],
      credits: { crew: [
        { job: 'Director of Photography', name: 'Greig Fraser' },
        { job: 'Director', name: 'Denis Villeneuve' },
      ] },
    }

    function mockTwoStepFetch(letterboxdHtml: string, tmdbJson: unknown, tmdbStatus = 200) {
      return vi.fn().mockImplementation((url: string) => {
        if (url.includes('letterboxd.com')) {
          return Promise.resolve(new Response(letterboxdHtml, {
            status: 200, headers: { 'Content-Type': 'text/html' },
          }))
        }
        if (url.includes('api.themoviedb.org')) {
          return Promise.resolve(new Response(JSON.stringify(tmdbJson), {
            status: tmdbStatus, headers: { 'Content-Type': 'application/json' },
          }))
        }
        return Promise.reject(new Error(`unexpected fetch: ${url}`))
      })
    }

    it('returns 400 when slug is missing', async () => {
      const res = await workerFetch(
        makeRequest('http://localhost:8787/tmdb'),
        { TMDB_API_KEY: 'test-key' },
      )
      expect(res.status).toBe(400)
      const body = await res.text()
      expect(body).toContain('slug')
    })

    it('returns 400 when slug has invalid characters', async () => {
      const res = await workerFetch(
        makeRequest('http://localhost:8787/tmdb?slug=' + encodeURIComponent('../etc/passwd')),
        { TMDB_API_KEY: 'test-key' },
      )
      expect(res.status).toBe(400)
    })

    it.each([
      ['---', 'only hyphens'],
      ['a--b', 'consecutive hyphens'],
      ['-dune', 'leading hyphen'],
      ['dune-', 'trailing hyphen'],
      ['', 'empty string'],
    ])('returns 400 for malformed slug %s (%s)', async (slug) => {
      const qs = slug === '' ? '' : `?slug=${encodeURIComponent(slug)}`
      const res = await workerFetch(
        makeRequest(`http://localhost:8787/tmdb${qs}`),
        { TMDB_API_KEY: 'test-key' },
      )
      expect(res.status).toBe(400)
    })

    it('accepts valid slug with trailing numeric disambiguator (e.g. dune-2021)', async () => {
      vi.stubGlobal('fetch', mockTwoStepFetch(happyHtml, happyTmdb, 200))
      const res = await workerFetch(
        makeRequest('http://localhost:8787/tmdb?slug=dune-2021'),
        { TMDB_API_KEY: 'test-key' },
      )
      expect(res.status).toBe(200)
      vi.unstubAllGlobals()
    })

    it('returns 503 when TMDB_API_KEY is not configured', async () => {
      const res = await workerFetch(
        makeRequest('http://localhost:8787/tmdb?slug=dune-2021'),
        { TMDB_API_KEY: '' },
      )
      expect(res.status).toBe(503)
    })

    it('returns 404 when data-tmdb-id is absurdly long (overflow guard)', async () => {
      const longId = '1'.repeat(20)
      const html = `<html><body data-tmdb-id="${longId}" data-tmdb-type="movie"><p>x</p></body></html>`
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        new Response(html, { status: 200, headers: { 'Content-Type': 'text/html' } }),
      ))
      const res = await workerFetch(
        makeRequest('http://localhost:8787/tmdb?slug=weird-film'),
        { TMDB_API_KEY: 'test-key' },
      )
      expect(res.status).toBe(404)
      vi.unstubAllGlobals()
    })

    it('returns 404 when Letterboxd page has no data-tmdb-id', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        new Response('<html><body class="x"><p>No film here</p></body></html>', {
          status: 200, headers: { 'Content-Type': 'text/html' },
        })
      ))
      const res = await workerFetch(
        makeRequest('http://localhost:8787/tmdb?slug=missing'),
        { TMDB_API_KEY: 'test-key' },
      )
      expect(res.status).toBe(404)
      vi.unstubAllGlobals()
    })

    it('returns 404 when Letterboxd page itself returns 404', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        new Response('not found', {
          status: 404, headers: { 'Content-Type': 'text/html' },
        })
      ))
      const res = await workerFetch(
        makeRequest('http://localhost:8787/tmdb?slug=nonexistent-film'),
        { TMDB_API_KEY: 'test-key' },
      )
      expect(res.status).toBe(404)
      vi.unstubAllGlobals()
    })

    it('returns 502 when TMDB upstream returns 401', async () => {
      vi.stubGlobal('fetch', mockTwoStepFetch(happyHtml, { status_message: 'Invalid API key' }, 401))
      const res = await workerFetch(
        makeRequest('http://localhost:8787/tmdb?slug=dune-2021'),
        { TMDB_API_KEY: 'bad-key' },
      )
      expect(res.status).toBe(502)
      const body = await res.text()
      // Never leak key status to the client
      expect(body.toLowerCase()).not.toContain('api key')
      expect(body.toLowerCase()).not.toContain('401')
      vi.unstubAllGlobals()
    })

    it('happy path returns shaped TMDB data with 7-day cache header', async () => {
      const mockFetch = mockTwoStepFetch(happyHtml, happyTmdb, 200)
      vi.stubGlobal('fetch', mockFetch)
      const res = await workerFetch(
        makeRequest('http://localhost:8787/tmdb?slug=dune-2021'),
        { TMDB_API_KEY: 'test-key' },
      )
      expect(res.status).toBe(200)
      expect(res.headers.get('Cache-Control')).toContain('max-age=604800')
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
      const json = await res.json() as Record<string, unknown>
      expect(json.tmdbId).toBe(438631)
      expect(json.type).toBe('movie')
      expect(json.title).toBe('Dune')
      expect(json.runtime).toBe(155)
      expect(json.director).toBe('Denis Villeneuve')
      expect(json.genres).toEqual(['Science Fiction', 'Adventure'])
      expect(json.posterUrl).toBe('https://image.tmdb.org/t/p/original/poster.jpg')
      expect(json.backdropUrl).toBe('https://image.tmdb.org/t/p/original/backdrop.jpg')

      // The worker must call TMDB with the key as a Bearer token (v4 auth) —
      // NOT as an `api_key` query param, so the key never shows up in URLs/logs.
      const tmdbCall = mockFetch.mock.calls.find(([u]) => String(u).includes('api.themoviedb.org'))
      expect(tmdbCall).toBeDefined()
      expect(String(tmdbCall![0])).not.toContain('api_key')
      expect(String(tmdbCall![0])).toContain('append_to_response=credits')
      const init = tmdbCall![1] as RequestInit & { headers: Record<string, string> }
      expect(init.headers.Authorization).toBe('Bearer test-key')

      vi.unstubAllGlobals()
    })

    it('returns empty posterUrl/backdropUrl when TMDB paths are null', async () => {
      const tmdbNoImages = { ...happyTmdb, poster_path: null, backdrop_path: null }
      vi.stubGlobal('fetch', mockTwoStepFetch(happyHtml, tmdbNoImages, 200))
      const res = await workerFetch(
        makeRequest('http://localhost:8787/tmdb?slug=dune-2021'),
        { TMDB_API_KEY: 'test-key' },
      )
      expect(res.status).toBe(200)
      const json = await res.json() as Record<string, unknown>
      expect(json.posterUrl).toBe('')
      expect(json.backdropUrl).toBe('')
      vi.unstubAllGlobals()
    })

    it('defaults type to movie when data-tmdb-type is absent', async () => {
      const htmlNoType = '<html><body data-tmdb-id="12345"><p>x</p></body></html>'
      const mockFetch = mockTwoStepFetch(htmlNoType, happyTmdb, 200)
      vi.stubGlobal('fetch', mockFetch)
      const res = await workerFetch(
        makeRequest('http://localhost:8787/tmdb?slug=some-film'),
        { TMDB_API_KEY: 'test-key' },
      )
      expect(res.status).toBe(200)
      const tmdbCall = mockFetch.mock.calls.find(([u]) => String(u).includes('api.themoviedb.org'))
      expect(String(tmdbCall![0])).toContain('/3/movie/12345')
      vi.unstubAllGlobals()
    })

    it('routes to /3/tv/ when data-tmdb-type is tv', async () => {
      const htmlTv = '<html><body data-tmdb-id="99999" data-tmdb-type="tv"><p>x</p></body></html>'
      const tvData = { ...happyTmdb, episode_run_time: [45], runtime: undefined, first_air_date: '2020-01-01' }
      const mockFetch = mockTwoStepFetch(htmlTv, tvData, 200)
      vi.stubGlobal('fetch', mockFetch)
      const res = await workerFetch(
        makeRequest('http://localhost:8787/tmdb?slug=some-show'),
        { TMDB_API_KEY: 'test-key' },
      )
      expect(res.status).toBe(200)
      const json = await res.json() as Record<string, unknown>
      expect(json.type).toBe('tv')
      expect(json.runtime).toBe(45)
      const tmdbCall = mockFetch.mock.calls.find(([u]) => String(u).includes('api.themoviedb.org'))
      expect(String(tmdbCall![0])).toContain('/3/tv/99999')
      vi.unstubAllGlobals()
    })
  })
})
