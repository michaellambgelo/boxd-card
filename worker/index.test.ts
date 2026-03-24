import { describe, it, expect, vi, beforeEach } from 'vitest'
import worker from './index'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(
  url: string,
  method = 'GET',
): Request {
  return new Request(url, { method })
}

function workerFetch(request: Request): Promise<Response> {
  return worker.fetch(request)
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
      expect(init.headers['Upgrade-Insecure-Requests']).toBe('1')
      expect(init.headers['Sec-Fetch-Mode']).toBe('navigate')

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
})
