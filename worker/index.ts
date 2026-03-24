/**
 * Boxd Card proxy worker — Cloudflare Worker
 *
 * Proxies requests to letterboxd.com and its CDN subdomains so the web app
 * can fetch page HTML and images without running into CORS restrictions.
 *
 * Only the explicitly listed hosts are allowed; all other targets return 403.
 *
 * Deploy:
 *   npx wrangler deploy
 *
 * Local dev (pairs with `npm run dev:web`):
 *   npx wrangler dev --port 8787
 */

const ALLOWED_HOSTS = ['letterboxd.com', 'a.ltrbxd.com', 's.ltrbxd.com', 'boxd.it']

function isAllowedHost(hostname: string): boolean {
  return ALLOWED_HOSTS.some(h => hostname === h || hostname.endsWith(`.${h}`))
}

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() })
    }

    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405 })
    }

    const requestUrl = new URL(request.url)
    const target = requestUrl.searchParams.get('url')

    if (!target) {
      return new Response('Missing required query param: url', { status: 400 })
    }

    let targetUrl: URL
    try {
      targetUrl = new URL(target)
    } catch {
      return new Response('Invalid url param', { status: 400 })
    }

    if (targetUrl.protocol !== 'https:') {
      return new Response('Only https targets are allowed', { status: 400 })
    }

    if (!isAllowedHost(targetUrl.hostname)) {
      return new Response('Target host not allowed', { status: 403 })
    }

    // The caller can pass ?accept=image to request an image response.
    // Without it, we send a browser-like HTML Accept header.
    const wantsImage = requestUrl.searchParams.get('accept') === 'image'
    const acceptHeader = wantsImage
      ? 'image/webp,image/avif,image/png,image/jpeg,*/*;q=0.1'
      : 'text/html,application/xhtml+xml,*/*;q=0.8'

    try {
      const upstream = await fetch(target, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; BoxdCard-Web/1.0; +https://boxd-card.michaellamb.dev)',
          Accept: acceptHeader,
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
        },
        redirect: 'follow',
      })

      const contentType = upstream.headers.get('Content-Type') ?? 'application/octet-stream'
      const body = await upstream.arrayBuffer()

      if (!upstream.ok) {
        const snippet = new TextDecoder().decode(body.slice(0, 512))
        console.log(`[proxy] upstream ${upstream.status} for ${target} | cf-ray: ${upstream.headers.get('cf-ray')} | body: ${snippet}`)
      }

      return new Response(body, {
        status: upstream.status,
        headers: {
          ...corsHeaders(),
          'Content-Type': contentType,
          // Short cache: Letterboxd content updates frequently
          'Cache-Control': 'public, max-age=60',
        },
      })
    } catch (err) {
      return new Response(`Upstream fetch failed: ${String(err)}`, { status: 502 })
    }
  },
}
