/**
 * Web scraper for Boxd Card web app.
 *
 * Mirrors the selectors in src/content/index.ts but operates on a Document
 * parsed from fetched HTML (via DOMParser) rather than the live browser DOM.
 * All image/page fetches are routed through the CORS proxy worker.
 *
 * Key differences from the extension content script:
 * - No chrome.* APIs — this is plain web code
 * - Images are never lazy-loaded in fetched HTML, so we always use
 *   data-poster-url rather than checking img.src
 * - Full-review text fetches also go through the proxy
 */

import type { CardType, ListCount, ReviewCount } from '../types'
import type { FilmData, FilmDataResponse } from '../content/index'

// ── Proxy ─────────────────────────────────────────────────────────────────────

// Set VITE_PROXY_URL in .env.local (project root) for local dev:
//   VITE_PROXY_URL=http://localhost:8787   (wrangler dev)
// For production the build bakes in the value at build time.
const PROXY_BASE: string =
  (import.meta.env.VITE_PROXY_URL as string | undefined) ??
  'https://proxy.boxd-card.michaellamb.dev'

export function proxyUrl(target: string, accept?: 'image'): string {
  let u = `${PROXY_BASE}?url=${encodeURIComponent(target)}`
  if (accept) u += `&accept=${accept}`
  return u
}

export async function fetchPageDocument(url: string): Promise<Document> {
  const res = await fetch(proxyUrl(url))
  if (!res.ok) {
    if (res.status === 403) {
      throw new Error(
        "Letterboxd's firewall is blocking this request. Try the browser extension for best results.",
      )
    }
    throw new Error(`HTTP ${res.status} fetching page`)
  }
  const html = await res.text()
  return new DOMParser().parseFromString(html, 'text/html')
}

/**
 * Resolve a Letterboxd /film/<slug>/image-NNN/ path to the actual CDN poster URL.
 *
 * Letterboxd's /image-NNN/ endpoints always return an HTML fragment (LazyPoster
 * component) rather than an image — the CDN URL is resolved by client-side JS.
 * The actual CDN URL is embedded in JSON-LD on the film's own page.
 */
async function resolvePosterCdnUrl(filmSlug: string): Promise<string> {
  const doc = await fetchPageDocument(`https://letterboxd.com/film/${filmSlug}/`)
  const jsonLdEl = doc.querySelector('script[type="application/ld+json"]')
  if (!jsonLdEl) throw new Error(`No JSON-LD found on film page for "${filmSlug}"`)
  const raw = (jsonLdEl.textContent ?? '')
    .replace(/^\/\*\s*<!\[CDATA\[[\s\S]*?\*\//m, '')  // strip leading CDATA comment
    .replace(/\/\*\s*\]\]>[\s\S]*?\*\/\s*$/m, '')      // strip trailing CDATA comment
    .trim()
  const data = JSON.parse(raw) as Record<string, unknown>
  if (typeof data.image !== 'string' || !data.image) {
    throw new Error(`No image in JSON-LD for "${filmSlug}"`)
  }
  return data.image
}

export async function fetchImageDataUrl(url: string): Promise<string> {
  let resolvedUrl = url

  // /film/<slug>/image-NNN/ is an HTML endpoint, not an image URL.
  // Fetch the film page and extract the CDN URL from JSON-LD.
  const filmPageMatch = url.match(/letterboxd\.com\/film\/([^/]+)\/image-\d+\/$/)
  if (filmPageMatch) {
    resolvedUrl = await resolvePosterCdnUrl(filmPageMatch[1])
  }

  const res = await fetch(proxyUrl(resolvedUrl, 'image'))
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching image`)
  const contentType = res.headers.get('content-type') ?? ''
  if (!contentType.startsWith('image/')) {
    throw new Error(`Expected image, got ${contentType}`)
  }
  const blob = await res.blob()
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

// ── Shared helpers ────────────────────────────────────────────────────────────

interface PosterAttrs {
  title: string
  year: string
  filmId: string
  posterUrl: string
}

/** Extract title/year/filmId/posterUrl from a LazyPoster item element. */
function extractPosterAttrs(item: Element): PosterAttrs {
  const lazyPoster = item.querySelector(
    '.react-component[data-component-class="LazyPoster"]',
  )
  const rawTitle = lazyPoster?.getAttribute('data-item-name') ?? ''
  const titleMatch = rawTitle.match(/^(.+?)(?:\s*\((\d{4})\))?$/)
  const title = titleMatch?.[1]?.trim() ?? rawTitle
  const year = titleMatch?.[2] ?? ''
  const filmId = lazyPoster?.getAttribute('data-film-id') ?? ''
  // In fetched HTML, img.src is never lazy-resolved — always use data-poster-url.
  const dataPosterUrl = lazyPoster?.getAttribute('data-poster-url') ?? ''
  const posterUrl = dataPosterUrl ? `https://letterboxd.com${dataPosterUrl}` : ''
  return { title, year, filmId, posterUrl }
}

// ── Scrapers ──────────────────────────────────────────────────────────────────

export function scrapeRecentActivity(doc: Document): FilmData[] {
  const items = Array.from(
    doc.querySelectorAll('section#recent-activity li.griditem'),
  ).slice(0, 4)

  // Fallback: /films/ page (ul.grid instead of #recent-activity)
  const source = items.length
    ? items
    : Array.from(doc.querySelectorAll('ul.grid li.griditem')).slice(0, 4)

  return source.map(item => {
    const { title, year, filmId, posterUrl } = extractPosterAttrs(item)
    const rating = item.querySelector('.rating')?.textContent?.trim() ?? ''
    return { title, year, rating, posterUrl, filmId }
  })
}

export function scrapeFavorites(doc: Document): FilmData[] {
  return Array.from(
    doc.querySelectorAll('section#favourites li.griditem'),
  ).slice(0, 4).map(item => {
    const { title, year, filmId, posterUrl } = extractPosterAttrs(item)
    return { title, year, rating: '', posterUrl, filmId }
  })
}

export function scrapeDiary(doc: Document, count = 4): FilmData[] {
  const rows = Array.from(
    doc.querySelectorAll('table#diary-table tbody tr.diary-entry-row'),
  ).slice(0, count)

  let currentMonth = ''
  let currentYear = ''

  return rows.map(row => {
    const { title, year, filmId, posterUrl } = extractPosterAttrs(row)

    const ratingEl =
      row.querySelector('.col-rating .hide-for-owner .rating') ??
      row.querySelector('.col-rating .rating')
    const rating = ratingEl?.textContent?.trim() ?? ''

    const monthEl = row.querySelector('.col-monthdate .monthdate a.month')
    const yearEl  = row.querySelector('.col-monthdate .monthdate a.year')
    if (monthEl?.textContent?.trim()) currentMonth = monthEl.textContent.trim()
    if (yearEl?.textContent?.trim())  currentYear  = yearEl.textContent.trim()

    const day  = row.querySelector('.col-daydate a.daydate')?.textContent?.trim() ?? ''
    const date = currentMonth && currentYear && day
      ? `${currentMonth} ${day}, ${currentYear}`
      : ''

    return { title, year, rating, posterUrl, filmId, date }
  })
}

const STAR_MAP = ['½', '★', '★½', '★★', '★★½', '★★★', '★★★½', '★★★★', '★★★★½', '★★★★★']
function ownerRatingToStars(value: string | null): string {
  if (!value) return ''
  const n = parseInt(value, 10)
  return (n >= 1 && n <= 10) ? STAR_MAP[n - 1] : ''
}

export function scrapeListMeta(
  doc: Document,
): { listTitle: string; listDescription: string; listTags: string[] } {
  const listTitle =
    doc.querySelector('.list-title-intro h1.title-1')?.textContent?.trim() ?? ''
  const listDescription = Array.from(
    doc.querySelectorAll('.list-title-intro .body-text p'),
  )
    .map(p => p.textContent?.trim() ?? '')
    .filter(t => t && !t.startsWith('Updated'))
    .join(' ')
  const listTags = Array.from(doc.querySelectorAll('ul.tags li a'))
    .map(a => a.textContent?.trim() ?? '')
    .filter(Boolean)
  return { listTitle, listDescription, listTags }
}

export function scrapeList(doc: Document, count: number): FilmData[] {
  return Array.from(
    doc.querySelectorAll(
      'ul.js-list-entries li.posteritem, ul.js-list-entries li.film-detail',
    ),
  ).slice(0, count).map(item => {
    const { title, year, filmId, posterUrl } = extractPosterAttrs(item)
    const ratingEl = item.querySelector('.rating')
    const rating =
      ratingEl?.textContent?.trim() ||
      ownerRatingToStars(item.getAttribute('data-owner-rating'))
    return { title, year, rating, posterUrl, filmId }
  })
}

async function fetchFullText(path: string): Promise<string> {
  try {
    const res = await fetch(proxyUrl(`https://letterboxd.com${path}`))
    if (!res.ok) return ''
    const html = await res.text()
    const div = document.createElement('div')
    div.innerHTML = html
    return Array.from(div.querySelectorAll('p'))
      .map(p => p.textContent?.trim() ?? '')
      .filter(Boolean)
      .join('\n\n')
  } catch {
    return ''
  }
}

export async function scrapeReviewsList(
  doc: Document,
  count: number,
): Promise<FilmData[]> {
  const items = Array.from(
    doc.querySelectorAll('div.viewing-list div.listitem.js-listitem'),
  ).slice(0, count)

  return Promise.all(
    items.map(async item => {
      const { title, year, filmId, posterUrl } = extractPosterAttrs(item)

      const rating =
        item
          .querySelector('.content-reactions-strip .inline-rating svg')
          ?.getAttribute('aria-label')
          ?.trim() ?? ''

      const dateStr =
        item
          .querySelector('.content-reactions-strip .date time')
          ?.getAttribute('datetime') ?? ''
      const date = dateStr
        ? new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
          })
        : ''

      const reviewBodyEl = item.querySelector('.js-review-body')
      let reviewText = ''
      if (reviewBodyEl) {
        const fullTextUrl = reviewBodyEl.getAttribute('data-full-text-url')
        if (fullTextUrl) {
          reviewText = await fetchFullText(fullTextUrl)
        } else {
          reviewText = Array.from(reviewBodyEl.querySelectorAll('p'))
            .map(p => p.textContent?.trim() ?? '')
            .filter(Boolean)
            .join('\n\n')
        }
      }

      const tags = Array.from(item.querySelectorAll('ul.tags li a'))
        .map(a => a.textContent?.trim() ?? '')
        .filter(Boolean)

      return { title, year, rating, posterUrl, filmId, date, reviewText, tags }
    }),
  )
}

// ── User / metadata scrapers ──────────────────────────────────────────────────

export function scrapeUsername(doc: Document): string {
  return (doc.body as HTMLBodyElement & { dataset: DOMStringMap }).dataset
    .owner ?? ''
}

/** Parse logged-in user info from inline Letterboxd <head> scripts. */
export function scrapeLoggedInUser(
  doc: Document,
): { username: string; avatarUrl: string } {
  for (const s of Array.from(doc.querySelectorAll('head script:not([src])'))) {
    const text = s.textContent ?? ''
    if (!text.includes('person') || !text.includes('loggedIn')) continue
    const loggedInMatch = text.match(
      /(?:person\.loggedIn\s*=\s*|"loggedIn"\s*:\s*)(true|false)/,
    )
    if (!loggedInMatch || loggedInMatch[1] !== 'true') continue
    const usernameMatch = text.match(
      /(?:person\.username\s*=\s*|"username"\s*:\s*)"([^"]+)"/,
    )
    const avatarMatch = text.match(
      /(?:person\.avatarURL24\s*=\s*|"avatarURL24"\s*:\s*)"([^"]+)"/,
    )
    if (!usernameMatch) continue
    const u = usernameMatch[1]
    const a = (avatarMatch?.[1] ?? '').replace('0-48-0-48-crop', '0-80-0-80-crop')
    return { username: u, avatarUrl: a }
  }
  return { username: '', avatarUrl: '' }
}

export function scrapePageOwnerAvatarUrl(doc: Document): string {
  const selectors = [
    '.profile-person-avatar img',
    '.profile-person .avatar img',
    'section.profile-header img.avatar',
    '.profile-summary .avatar img',
    '.person-summary .avatar img',
  ]
  for (const sel of selectors) {
    const el = doc.querySelector(sel) as HTMLImageElement | null
    if (!el) continue
    const src =
      el.getAttribute('data-src') || el.getAttribute('src') || ''
    if (src && !src.includes('empty') && !src.includes('placeholder') && src.startsWith('http')) {
      return src.replace('0-48-0-48-crop', '0-80-0-80-crop')
    }
  }
  return ''
}

export function scrapeBackdropUrl(doc: Document): string {
  const el = doc.querySelector('[data-backdrop-retina], [data-backdrop]')
  if (!el) return ''
  const raw =
    el.getAttribute('data-backdrop-retina') ||
    el.getAttribute('data-backdrop') ||
    ''
  return raw.startsWith('//') ? `https:${raw}` : raw
}

// ── URL parsing & resolution ──────────────────────────────────────────────────

export interface ParsedLetterboxdUrl {
  username: string
  /** null when the URL is a profile page (ambiguous: could be last-four-watched or favorites) */
  cardType: CardType | null
  listSlug: string
  /** true only for /reviews/ list pages; false for single film review pages */
  isReviewListPage: boolean
  /** non-empty for single film review pages: the film slug from the URL */
  filmSlug: string
}

/**
 * Parse a letterboxd.com URL into its component parts.
 * Returns null when the URL is not a recognisable Letterboxd or boxd.it URL.
 * Returns { cardType: null } for profile-page URLs that are ambiguous between
 * last-four-watched and favorites.
 */
export function parseLetterboxdUrl(input: string): ParsedLetterboxdUrl | null {
  let parsed: URL
  try { parsed = new URL(input) } catch { return null }

  const hostname = parsed.hostname.replace(/^www\./, '')

  // Short URL — card type can't be determined without fetching
  if (hostname === 'boxd.it') {
    return { username: '', cardType: null, listSlug: '', isReviewListPage: false, filmSlug: '' }
  }

  if (hostname !== 'letterboxd.com') return null

  // Strip leading/trailing slashes, split path segments
  const parts = parsed.pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean)
  const username = parts[0]
  if (!username) return null

  const section  = parts[1]  // undefined | 'films' | 'diary' | 'list' | 'reviews' | 'film' | ...
  const subpart  = parts[2]  // undefined | diary-slug | list-slug | ...

  if (!section) {
    // https://letterboxd.com/username/
    // Could be last-four-watched or favorites — let caller decide.
    return { username, cardType: null, listSlug: '', isReviewListPage: false, filmSlug: '' }
  }
  if (section === 'films' && !subpart) {
    return { username, cardType: 'last-four-watched', listSlug: '', isReviewListPage: false, filmSlug: '' }
  }
  if (section === 'diary' || (section === 'films' && subpart === 'diary')) {
    return { username, cardType: 'recent-diary', listSlug: '', isReviewListPage: false, filmSlug: '' }
  }
  if (section === 'list' && subpart) {
    return { username, cardType: 'list', listSlug: subpart, isReviewListPage: false, filmSlug: '' }
  }
  if (section === 'reviews') {
    return { username, cardType: 'review', listSlug: '', isReviewListPage: true, filmSlug: '' }
  }
  if (section === 'film' && subpart) {
    // Single film review: /username/film/slug/ or /username/film/slug/N/
    const entryNum = parts[3] // e.g. '6' for the 6th viewing of the same film
    const filmSlug = entryNum ? `${subpart}/${entryNum}` : subpart
    return { username, cardType: 'review', listSlug: '', isReviewListPage: false, filmSlug }
  }

  return null
}

/**
 * Resolve any Letterboxd or boxd.it URL to its canonical form, then parse it.
 * Use this when parseLetterboxdUrl returns null or { cardType: null } because
 * the URL is a short link that needs to be fetched first.
 */
export async function resolveLetterboxdUrl(input: string): Promise<ParsedLetterboxdUrl> {
  const doc = await fetchPageDocument(input)
  // Prefer <link rel="canonical">; fall back to og:url (boxd.it pages omit the canonical tag).
  const canonical =
    doc.querySelector('link[rel="canonical"]')?.getAttribute('href') ||
    doc.querySelector('meta[property="og:url"]')?.getAttribute('content') ||
    ''
  const resolved = canonical ? parseLetterboxdUrl(canonical) : null
  if (!resolved || !resolved.username) {
    throw new Error('Could not determine the Letterboxd page from this URL.')
  }
  return resolved
}

// ── Main entry point ──────────────────────────────────────────────────────────

/** Build the canonical Letterboxd URL for a username + card type. */
export function buildPageUrl(
  username: string,
  cardType: CardType,
  listSlug: string,
  filmSlug = '',
): string {
  const base = `https://letterboxd.com/${username}`
  switch (cardType) {
    case 'last-four-watched': return `${base}/`
    case 'favorites':         return `${base}/`
    case 'recent-diary':      return `${base}/diary/`
    case 'list':              return `${base}/list/${listSlug}/`
    case 'review':            return filmSlug ? `${base}/film/${filmSlug}/` : `${base}/reviews/`
  }
}

/** Scrape a single film review page. Returns a one-element array. */
export async function scrapeSingleReview(doc: Document): Promise<FilmData[]> {
  const lazyPoster = doc.querySelector(
    'section.viewing-poster-container .react-component[data-component-class="LazyPoster"]',
  )
  const dataPosterUrl = lazyPoster?.getAttribute('data-poster-url') ?? ''
  const posterUrl = dataPosterUrl ? `https://letterboxd.com${dataPosterUrl}` : ''
  const filmId = lazyPoster?.getAttribute('data-film-id') ?? ''

  const title =
    doc.querySelector('header.inline-production-masthead h2.primaryname a')?.textContent?.trim() ?? ''
  const year =
    doc.querySelector('header.inline-production-masthead .releasedate a')?.textContent?.trim() ?? ''

  const rating =
    doc.querySelector('.content-reactions-strip span.inline-rating svg')
      ?.getAttribute('aria-label')?.trim() ?? ''

  // view-date has three <a> links: day, month, year
  const dateLinks = Array.from(doc.querySelectorAll('p.view-date a'))
  let date = ''
  if (dateLinks.length >= 3) {
    const [day, month, yr] = dateLinks.map(a => a.textContent?.trim() ?? '')
    date = `${month} ${day}, ${yr}`
  }

  const reviewBodyEl = doc.querySelector('.js-review-body')
  let reviewText = ''
  if (reviewBodyEl) {
    const fullTextUrl = reviewBodyEl.getAttribute('data-full-text-url')
    if (fullTextUrl) {
      reviewText = await fetchFullText(fullTextUrl)
    } else {
      reviewText = Array.from(reviewBodyEl.querySelectorAll('p'))
        .map(p => p.textContent?.trim() ?? '')
        .filter(Boolean)
        .join('\n\n')
    }
  }

  const tags = Array.from(doc.querySelectorAll('ul.tags li a'))
    .map(a => a.textContent?.trim() ?? '')
    .filter(Boolean)

  if (!title) return []
  return [{ title, year, rating, posterUrl, filmId, date, reviewText, tags }]
}

/**
 * Fetch and scrape a Letterboxd page, returning structured film data ready
 * for renderCard().
 */
export async function scrapeLetterboxdPage(
  username: string,
  cardType: CardType,
  listSlug: string,
  listCount: ListCount,
  reviewCount: ReviewCount,
  isReviewListPage = true,
  filmSlug = '',
): Promise<FilmDataResponse> {
  const url = buildPageUrl(username, cardType, listSlug, filmSlug)
  const doc = await fetchPageDocument(url)

  const pageUsername   = scrapeUsername(doc)
  const backdropUrl    = scrapeBackdropUrl(doc)
  const { username: loggedInUsername, avatarUrl: loggedInAvatarUrl } =
    scrapeLoggedInUser(doc)
  const authorAvatarUrl = scrapePageOwnerAvatarUrl(doc)

  let films: FilmData[]
  let listTitle: string | undefined
  let listDescription: string | undefined
  let listTags: string[] | undefined

  switch (cardType) {
    case 'last-four-watched':
      films = scrapeRecentActivity(doc)
      break
    case 'favorites':
      films = scrapeFavorites(doc)
      break
    case 'recent-diary':
      films = scrapeDiary(doc, listCount)
      break
    case 'list': {
      films = scrapeList(doc, listCount)
      const meta = scrapeListMeta(doc)
      listTitle       = meta.listTitle
      listDescription = meta.listDescription
      listTags        = meta.listTags
      break
    }
    case 'review':
      films = isReviewListPage
        ? await scrapeReviewsList(doc, reviewCount)
        : await scrapeSingleReview(doc)
      break
    default:
      films = []
  }

  return {
    films,
    // Use the scraped username (from body[data-owner]) as the authoritative
    // value; fall back to the user-supplied username if scraping fails.
    username:         pageUsername || username,
    listTitle,
    listDescription,
    listTags,
    backdropUrl,
    loggedInUsername,
    loggedInAvatarUrl,
    authorAvatarUrl,
  }
}
