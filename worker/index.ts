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
 *   POST /feedback
 *     Extension-only feedback and error reports. Validated against the shared
 *     schema in src/shared/feedback.ts, stored in the FEEDBACK KV namespace for
 *     180 days, and emailed to FEEDBACK_TO. Triage is wrangler-only — there is
 *     deliberately no read route. See scripts/feedback.mjs.
 *
 * Deploy:
 *   npx wrangler deploy
 *
 * Local dev (pairs with `npm run dev:web`):
 *   npx wrangler dev --port 8787
 */

import { FEEDBACK_LIMITS, FEEDBACK_RETENTION_DAYS, validateFeedback, type FeedbackPayload } from '../src/shared/feedback'

const ALLOWED_HOSTS = ['letterboxd.com', 'a.ltrbxd.com', 's.ltrbxd.com', 'boxd.it', 'image.tmdb.org']

/**
 * Cloudflare's rate-limiting binding. Optional: when the binding isn't
 * configured the worker fails open and behaves exactly as before, so this can
 * be switched on with a wrangler.toml uncomment and a deploy.
 */
interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>
}

/** The slice of KVNamespace the feedback route uses — keeps tests honest. */
interface FeedbackStore {
  get(key: string): Promise<string | null>
  put(key: string, value: string, options?: { expirationTtl?: number; metadata?: unknown }): Promise<void>
}

/** The slice of Cloudflare Email Sending's `send_email` binding we use. */
interface EmailSender {
  send(message: {
    to: string
    from: { email: string; name?: string }
    replyTo?: string
    subject: string
    text: string
  }): Promise<unknown>
}

interface Env {
  TMDB_API_KEY: string
  RATE_LIMITER?: RateLimiter
  FEEDBACK?: FeedbackStore
  EMAIL?: EmailSender
  FEEDBACK_TO?: string
  FEEDBACK_FROM?: string
  /** Emails per UTC day before the route stops emailing (it keeps storing). */
  FEEDBACK_DAILY_EMAIL_CAP?: string
}

interface Ctx {
  waitUntil(promise: Promise<unknown>): void
}

/**
 * Throttle per client IP.
 *
 * This proxy is unauthenticated and open to anyone, and every request it serves
 * is a request to Letterboxd from a Cloudflare egress IP under a User-Agent
 * naming boxd-card.com. The cost of abuse isn't the Workers bill — it's
 * Letterboxd blocking that traffic, which takes the product down with it.
 *
 * Fails open on a missing binding or a binding error: throttling is a
 * protection, not a dependency.
 */
async function isRateLimited(request: Request, env: Env): Promise<boolean> {
  const limiter = env.RATE_LIMITER
  if (!limiter) return false
  const key = request.headers.get('CF-Connecting-IP') ?? 'unknown'
  try {
    const { success } = await limiter.limit({ key })
    return !success
  } catch {
    return false
  }
}

function isAllowedHost(hostname: string): boolean {
  return ALLOWED_HOSTS.some(h => hostname === h || hostname.endsWith(`.${h}`))
}

/**
 * Check the URL a fetch actually resolved to, after any redirects.
 *
 * An empty `Response.url` means "no redirect information available" — that's
 * what a hand-constructed Response carries, and it's what we get back when the
 * runtime doesn't populate it. Treat it as no redirect having happened: the
 * requested host was already vetted, so allowing it here can't widen the
 * allowlist. Only a URL we can parse *and* that resolves off-allowlist is a
 * block.
 */
function isAllowedFinalUrl(finalUrl: string): boolean {
  if (!finalUrl) return true
  try {
    return isAllowedHost(new URL(finalUrl).hostname)
  } catch {
    return true
  }
}

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  }
}

/**
 * Every response the worker generates itself must carry CORS headers, or the
 * browser rejects it outright and `fetch` throws a TypeError instead of
 * resolving with a status — so the web app can't read the reason and shows a
 * generic network error. Upstream responses already go out through the success
 * path, which sets them.
 */
function errorResponse(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'text/plain; charset=utf-8' },
  })
}

async function fetchUpstream(target: string, wantsImage: boolean): Promise<Response> {
  const acceptHeader = wantsImage
    ? 'image/webp,image/avif,image/png,image/jpeg,*/*;q=0.1'
    : 'text/html,application/xhtml+xml,*/*;q=0.8'

  return fetch(target, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; BoxdCard-Web/1.0; +https://boxd-card.com)',
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
    return errorResponse('Missing required query param: url', 400)
  }

  let targetUrl: URL
  try {
    targetUrl = new URL(target)
  } catch {
    return errorResponse('Invalid url param', 400)
  }

  if (targetUrl.protocol !== 'https:') {
    return errorResponse('Only https targets are allowed', 400)
  }

  if (!isAllowedHost(targetUrl.hostname)) {
    return errorResponse('Target host not allowed', 403)
  }

  const wantsImage = requestUrl.searchParams.get('accept') === 'image'

  try {
    const upstream = await fetchUpstream(target, wantsImage)

    // The allowlist above only vets the URL we *asked* for. `redirect: 'follow'`
    // means an open redirect on an allowed host (boxd.it is a redirector by
    // design) could land us somewhere else entirely and hand the body back with
    // `Access-Control-Allow-Origin: *`. Re-check where we actually ended up.
    if (!isAllowedFinalUrl(upstream.url)) {
      console.log(`[proxy] blocked off-allowlist redirect for ${targetUrl.hostname}`)
      return errorResponse('Redirected to a host that is not allowed', 403)
    }

    const upstreamType = upstream.headers.get('Content-Type') ?? 'application/octet-stream'
    // When an image was asked for, refuse to relay anything else. Letterboxd's
    // CDNs host user-uploaded content, and echoing an HTML content type would
    // let a response render as a document on the api.boxd-card.com origin.
    if (wantsImage && !upstreamType.startsWith('image/')) {
      return errorResponse(`Expected an image, upstream sent ${upstreamType}`, 502)
    }

    const body = await upstream.arrayBuffer()

    if (!upstream.ok) {
      // Status and cf-ray only. The body is Letterboxd page content and these
      // logs are persisted (see wrangler.toml [observability.logs]).
      console.log(`[proxy] upstream ${upstream.status} for ${targetUrl.hostname}${targetUrl.pathname} | cf-ray: ${upstream.headers.get('cf-ray')}`)
    }

    return new Response(body, {
      status: upstream.status,
      headers: {
        ...corsHeaders(),
        'Content-Type': upstreamType,
        // Don't let a browser sniff a relayed response into something
        // executable on our origin.
        'X-Content-Type-Options': 'nosniff',
        // Short cache: Letterboxd content updates frequently
        'Cache-Control': 'public, max-age=60',
      },
    })
  } catch (err) {
    return errorResponse(`Upstream fetch failed: ${String(err)}`, 502)
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
    return errorResponse('TMDB not configured', 503)
  }

  const requestUrl = new URL(request.url)
  const slug = requestUrl.searchParams.get('slug')
  if (!slug) {
    return errorResponse('Missing required query param: slug', 400)
  }

  // Letterboxd slugs are alphanumeric words separated by single hyphens.
  // Reject consecutive hyphens, leading/trailing hyphens, and non-alphanum chars.
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/i.test(slug)) {
    return errorResponse('Invalid slug', 400)
  }

  // Step 1: fetch the Letterboxd film page for data-tmdb-id.
  const filmPageUrl = `https://letterboxd.com/film/${slug}/`
  let pageHtml: string
  try {
    const page = await fetchUpstream(filmPageUrl, false)
    if (!page.ok) {
      console.log(`[tmdb] letterboxd ${page.status} for ${filmPageUrl}`)
      return errorResponse('Letterboxd page not found', 404)
    }
    pageHtml = await page.text()
  } catch (err) {
    return errorResponse(`Letterboxd fetch failed: ${String(err)}`, 502)
  }

  const extracted = extractTmdbIdFromHtml(pageHtml)
  if (!extracted) {
    return errorResponse('No TMDB ID found on Letterboxd page', 404)
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
      return errorResponse('TMDB upstream error', 502)
    }
    tmdbData = (await tmdbRes.json()) as TmdbMovieResponse
  } catch (err) {
    console.log(`[tmdb] fetch threw: ${String(err)}`)
    return errorResponse('TMDB fetch failed', 502)
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

// ── Feedback endpoint ───────────────────────────────────────────────────────

const FEEDBACK_TTL_SECONDS = FEEDBACK_RETENTION_DAYS * 24 * 60 * 60
const DEFAULT_DAILY_EMAIL_CAP = 50

/** What lands in KV. `expiresAt` lets the triage script re-put without resetting the TTL. */
export interface FeedbackRecord extends FeedbackPayload {
  id: string
  receivedAt: string
  expiresAt: number
  status: 'new'
  notes: string
}

/** KV key metadata — what `wrangler kv key list` shows without a get per key. */
export interface FeedbackMetadata {
  kind: FeedbackPayload['kind']
  status: string
  receivedAt: string
  preview: string
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json; charset=utf-8' },
  })
}

function oneLine(text: string, max: number): string {
  const flat = text.replace(/[\r\n\t]+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

function feedbackEmailText(record: FeedbackRecord, key: string): string {
  const lines = [
    `Kind:      ${record.kind}`,
    `Received:  ${record.receivedAt}`,
    `KV key:    ${key}`,
    `Reply to:  ${record.email ?? '(none given)'}`,
    '',
    'Message',
    '-------',
    record.message || '(no message)',
  ]
  const d = record.diagnostics
  if (d) {
    lines.push('', 'Diagnostics', '-----------')
    for (const [name, value] of Object.entries(d)) {
      lines.push(`${name}: ${String(value)}`)
    }
  }
  lines.push(
    '',
    `Stored in KV namespace FEEDBACK for ${FEEDBACK_RETENTION_DAYS} days.`,
    `Triage (repo root): npm run feedback -- show ${record.id.slice(0, 8)}`,
  )
  return lines.join('\n')
}

/**
 * Soft global cap on notification emails. KV is eventually consistent and this
 * is read-modify-write, so a burst can overshoot by a few — fine for a spam
 * brake. Storage is never capped: a submission past the cap is still in KV.
 */
async function underDailyEmailCap(env: Env, store: FeedbackStore): Promise<boolean> {
  const cap = Number(env.FEEDBACK_DAILY_EMAIL_CAP) || DEFAULT_DAILY_EMAIL_CAP
  const key = `meta:emails:${new Date().toISOString().slice(0, 10)}`
  const sent = Number(await store.get(key)) || 0
  if (sent >= cap) return false
  // Two days so the key outlives its UTC day regardless of when it was written.
  await store.put(key, String(sent + 1), { expirationTtl: 2 * 24 * 60 * 60 })
  return true
}

async function sendFeedbackEmail(env: Env, store: FeedbackStore, record: FeedbackRecord, key: string): Promise<void> {
  if (!env.EMAIL || !env.FEEDBACK_TO || !env.FEEDBACK_FROM) {
    console.log(`[feedback] email not configured; stored only | id: ${record.id}`)
    return
  }
  try {
    if (!(await underDailyEmailCap(env, store))) {
      console.log(`[feedback] daily email cap reached; stored only | id: ${record.id}`)
      return
    }
    const summary = oneLine(record.message || record.diagnostics?.errorMessage || '', 60)
    await env.EMAIL.send({
      to: env.FEEDBACK_TO,
      from: { email: env.FEEDBACK_FROM, name: 'Boxd Card Feedback' },
      ...(record.email && { replyTo: record.email }),
      subject: `[Boxd Card ${record.kind}] ${summary || record.id}`,
      // Plain text only: the body is user-supplied, and HTML would make it markup.
      text: feedbackEmailText(record, key),
    })
  } catch (err) {
    // The submission is already in KV — a failed email loses nothing.
    console.log(`[feedback] email failed | id: ${record.id} | ${String(err).slice(0, 200)}`)
  }
}

/**
 * Accept a feedback/error report from the extension.
 *
 * Never log the message, email or diagnostics: [observability.logs] persist
 * is on, and these are user-written. Id and kind only. The client IP is not
 * stored either.
 */
async function handleFeedback(request: Request, env: Env, ctx: Ctx): Promise<Response> {
  const store = env.FEEDBACK
  if (!store) {
    console.log('[feedback] FEEDBACK KV binding not configured')
    return errorResponse('Feedback is not configured', 503)
  }

  // A filter against drive-by POSTs from ordinary web pages, NOT
  // authentication: anything outside a browser can send any Origin it likes.
  // A prefix rather than the Web Store id, because unpacked dev builds get a
  // different id.
  const origin = request.headers.get('Origin') ?? ''
  if (!origin.startsWith('chrome-extension://')) {
    return errorResponse('Feedback is accepted from the Boxd Card extension only', 403)
  }

  const declared = Number(request.headers.get('Content-Length'))
  if (declared > FEEDBACK_LIMITS.body) {
    return errorResponse('Feedback is too large', 413)
  }
  const raw = await request.text()
  if (new TextEncoder().encode(raw).length > FEEDBACK_LIMITS.body) {
    return errorResponse('Feedback is too large', 413)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return errorResponse('Body must be JSON', 400)
  }
  const result = validateFeedback(parsed)
  if (!result.ok) {
    return errorResponse(result.error, 400)
  }

  const now = new Date()
  const id = crypto.randomUUID()
  const record: FeedbackRecord = {
    ...result.value,
    id,
    receivedAt: now.toISOString(),
    expiresAt: Math.floor(now.getTime() / 1000) + FEEDBACK_TTL_SECONDS,
    status: 'new',
    notes: '',
  }
  // ISO timestamp first so `kv key list --prefix fb:` comes back oldest-first.
  const key = `fb:${record.receivedAt}:${id}`
  const metadata: FeedbackMetadata = {
    kind: record.kind,
    status: record.status,
    receivedAt: record.receivedAt,
    preview: oneLine(record.message || record.diagnostics?.errorMessage || '', 80),
  }

  try {
    await store.put(key, JSON.stringify(record), { expirationTtl: FEEDBACK_TTL_SECONDS, metadata })
  } catch (err) {
    console.log(`[feedback] KV put failed | id: ${id} | ${String(err).slice(0, 200)}`)
    return errorResponse('Could not save feedback, please try again', 503)
  }
  console.log(`[feedback] stored | id: ${id} | kind: ${record.kind}`)

  ctx.waitUntil(sendFeedbackEmail(env, store, record, key))
  return jsonResponse({ id }, 201)
}

export default {
  async fetch(request: Request, env: Env, ctx: Ctx = { waitUntil: () => {} }): Promise<Response> {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() })
    }

    const { pathname } = new URL(request.url)

    // The only non-GET route, so it is routed before the GET-only gate below.
    // The per-isolate limiter is a weak brake (see wrangler.toml); the real
    // spam control is the daily email cap inside handleFeedback.
    if (pathname === '/feedback') {
      if (request.method !== 'POST') return errorResponse('Method not allowed', 405)
      if (await isRateLimited(request, env)) {
        return errorResponse('Too many requests', 429)
      }
      return handleFeedback(request, env, ctx)
    }

    if (request.method !== 'GET') {
      return errorResponse('Method not allowed', 405)
    }

    if (await isRateLimited(request, env)) {
      return new Response('Too many requests', {
        status: 429,
        headers: { ...corsHeaders(), 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': '60' },
      })
    }

    if (pathname === '/tmdb') {
      return handleTmdb(request, env)
    }
    return handleProxy(request)
  },
}
