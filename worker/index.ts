/**
 * Boxd Card proxy worker — Cloudflare Worker
 *
 * Two routes:
 *   GET /?url=<target>[&accept=image]
 *     Proxies letterboxd.com and its CDN subdomains (plus image.tmdb.org) so
 *     the web app can fetch page HTML and images without running into CORS.
 *     Only the explicitly listed hosts are allowed; all other targets → 403.
 *
 *   GET /tmdb?slug=<letterboxd-film-slug>
 *     Scrapes data-tmdb-id from the Letterboxd film page, then queries TMDB
 *     for metadata (title, director, runtime, genres, poster, backdrop).
 *     Requires TMDB_API_KEY secret. Response is cached for 7 days.
 *
 * Deploy:
 *   npx wrangler deploy
 *
 * Local dev (pairs with `npm run dev:web`):
 *   npx wrangler dev --port 8787
 */

const ALLOWED_HOSTS = ['letterboxd.com', 'a.ltrbxd.com', 's.ltrbxd.com', 'boxd.it', 'image.tmdb.org']

interface Env {
  TMDB_API_KEY: string
}

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

async function fetchUpstream(target: string, wantsImage: boolean): Promise<Response> {
  const acceptHeader = wantsImage
    ? 'image/webp,image/avif,image/png,image/jpeg,*/*;q=0.1'
    : 'text/html,application/xhtml+xml,*/*;q=0.8'

  return fetch(target, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; BoxdCard-Web/1.0; +https://boxd-card.michaellamb.dev)',
      Accept: acceptHeader,
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
    },
    redirect: 'follow',
  })
}

async function handleProxy(request: Request): Promise<Response> {
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

  const wantsImage = requestUrl.searchParams.get('accept') === 'image'

  try {
    const upstream = await fetchUpstream(target, wantsImage)
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
}

// ── TMDB endpoint ───────────────────────────────────────────────────────────

interface TmdbCrew { job: string; name: string }
interface TmdbGenre { id: number; name: string }
interface TmdbMovieResponse {
  title?: string
  name?: string
  release_date?: string
  first_air_date?: string
  runtime?: number
  episode_run_time?: number[]
  overview?: string
  poster_path?: string | null
  backdrop_path?: string | null
  genres?: TmdbGenre[]
  credits?: { crew?: TmdbCrew[] }
}

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/original'
const BODY_TAG_RE = /<body\b[^>]*>/i
const TMDB_ID_RE = /\bdata-tmdb-id="(\d+)"/i
const TMDB_TYPE_RE = /\bdata-tmdb-type="([^"]+)"/i
// Real TMDB IDs are at most ~7 digits. Cap generously — anything above this is
// either malformed HTML or a numeric overflow risk before we hand it to TMDB.
const TMDB_ID_MAX_LEN = 10

function extractTmdbIdFromHtml(html: string): { id: string; type: string } | null {
  const bodyMatch = html.match(BODY_TAG_RE)
  if (!bodyMatch) return null
  const bodyTag = bodyMatch[0]
  const idMatch = bodyTag.match(TMDB_ID_RE)
  if (!idMatch) return null
  const id = idMatch[1]
  if (id.length > TMDB_ID_MAX_LEN) return null
  const typeMatch = bodyTag.match(TMDB_TYPE_RE)
  return { id, type: typeMatch?.[1] ?? 'movie' }
}

function deriveDirector(data: TmdbMovieResponse): string {
  const crew = data.credits?.crew ?? []
  // Movies: 'Director'. TV: fall back to 'Creator'/'Executive Producer'.
  const director = crew.find(c => c.job === 'Director')
  if (director) return director.name
  const creator = crew.find(c => c.job === 'Creator' || c.job === 'Executive Producer')
  return creator?.name ?? ''
}

function deriveRuntime(data: TmdbMovieResponse): number {
  if (typeof data.runtime === 'number') return data.runtime
  const episodes = data.episode_run_time
  if (Array.isArray(episodes) && episodes.length > 0 && typeof episodes[0] === 'number') {
    return episodes[0]
  }
  return 0
}

async function handleTmdb(request: Request, env: Env): Promise<Response> {
  const apiKey = env.TMDB_API_KEY
  if (!apiKey) {
    console.log('[tmdb] TMDB_API_KEY secret not configured')
    return new Response('TMDB not configured', {
      status: 503,
      headers: corsHeaders(),
    })
  }

  const requestUrl = new URL(request.url)
  const slug = requestUrl.searchParams.get('slug')
  if (!slug) {
    return new Response('Missing required query param: slug', {
      status: 400,
      headers: corsHeaders(),
    })
  }

  // Letterboxd slugs are alphanumeric words separated by single hyphens.
  // Reject consecutive hyphens, leading/trailing hyphens, and non-alphanum chars.
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/i.test(slug)) {
    return new Response('Invalid slug', { status: 400, headers: corsHeaders() })
  }

  // Step 1: fetch the Letterboxd film page for data-tmdb-id.
  const filmPageUrl = `https://letterboxd.com/film/${slug}/`
  let pageHtml: string
  try {
    const page = await fetchUpstream(filmPageUrl, false)
    if (!page.ok) {
      console.log(`[tmdb] letterboxd ${page.status} for ${filmPageUrl}`)
      return new Response('Letterboxd page not found', {
        status: 404,
        headers: corsHeaders(),
      })
    }
    pageHtml = await page.text()
  } catch (err) {
    return new Response(`Letterboxd fetch failed: ${String(err)}`, {
      status: 502,
      headers: corsHeaders(),
    })
  }

  const extracted = extractTmdbIdFromHtml(pageHtml)
  if (!extracted) {
    return new Response('No TMDB ID found on Letterboxd page', {
      status: 404,
      headers: corsHeaders(),
    })
  }

  const type = extracted.type === 'tv' ? 'tv' : 'movie'

  // Step 2: call TMDB.
  const tmdbUrl = `https://api.themoviedb.org/3/${type}/${extracted.id}?append_to_response=credits`
  let tmdbData: TmdbMovieResponse
  try {
    const tmdbRes = await fetch(tmdbUrl, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
    })
    if (!tmdbRes.ok) {
      console.log(`[tmdb] upstream ${tmdbRes.status} for ${type}/${extracted.id}`)
      return new Response('TMDB upstream error', {
        status: 502,
        headers: corsHeaders(),
      })
    }
    tmdbData = (await tmdbRes.json()) as TmdbMovieResponse
  } catch (err) {
    console.log(`[tmdb] fetch threw: ${String(err)}`)
    return new Response('TMDB fetch failed', {
      status: 502,
      headers: corsHeaders(),
    })
  }

  const posterPath = tmdbData.poster_path ?? ''
  const backdropPath = tmdbData.backdrop_path ?? ''

  const body = {
    tmdbId: Number(extracted.id),
    type,
    title: tmdbData.title ?? tmdbData.name ?? '',
    releaseDate: tmdbData.release_date ?? tmdbData.first_air_date ?? '',
    runtime: deriveRuntime(tmdbData),
    overview: tmdbData.overview ?? '',
    director: deriveDirector(tmdbData),
    genres: (tmdbData.genres ?? []).map(g => g.name),
    posterPath,
    backdropPath,
    posterUrl: posterPath ? `${TMDB_IMAGE_BASE}${posterPath}` : '',
    backdropUrl: backdropPath ? `${TMDB_IMAGE_BASE}${backdropPath}` : '',
  }

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      ...corsHeaders(),
      'Content-Type': 'application/json; charset=utf-8',
      // Cache mismatch vs. /?url=... is intentional:
      //   - Letterboxd pages (diary/list/profile) change constantly → 60s.
      //   - TMDB film metadata is effectively immutable → 7 days.
      // Edge case: if Letterboxd ever re-maps a slug to a different TMDB ID
      // mid-week, this response will be stale for up to 7 days. Accepted —
      // slug→id remaps are vanishingly rare and the cache buys real latency.
      'Cache-Control': 'public, max-age=604800, s-maxage=604800',
    },
  })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() })
    }

    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405 })
    }

    const { pathname } = new URL(request.url)
    if (pathname === '/tmdb') {
      return handleTmdb(request, env)
    }
    return handleProxy(request)
  },
}
