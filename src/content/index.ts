import type { CardType, ListCount, ReviewCount } from '../types'

export interface FilmData {
  title: string
  year: string
  rating: string
  posterUrl: string
  filmId: string
  date?: string       // ISO-ish date string; populated by diary/review scrapers
  reviewText?: string // review body text; populated by review scrapers only
  tags?: string[]     // user tags; populated by review scrapers only
}

export interface FilmDataResponse {
  films: FilmData[]
  username: string
  listTitle?: string
  listDescription?: string
  listTags?: string[] // user tags for the list itself
  backdropUrl?: string
  loggedInUsername?: string  // logged-in user; used by popup for isOwnProfile detection only
  loggedInAvatarUrl?: string // logged-in user avatar; used when isOwnProfile
  authorAvatarUrl?: string   // page owner avatar; used when not isOwnProfile
}

export interface GetFilmDataRequest {
  type: 'GET_FILM_DATA'
  cardType: CardType
  listCount?: ListCount
  reviewCount?: ReviewCount
}

const PLACEHOLDER = 'empty-poster'

// ── Recent Activity (Last Four Watched) ──────────────────────────────────────

export function scrapeRecentActivity(): FilmData[] {
  const items = Array.from(
    document.querySelectorAll('section#recent-activity li.griditem')
  ).slice(0, 4)

  return items.map((item) => {
    const lazyPoster = item.querySelector(
      '.react-component[data-component-class="LazyPoster"]'
    )
    const img = item.querySelector('img.image') as HTMLImageElement | null
    const ratingEl = item.querySelector('.rating')

    const rawTitle = lazyPoster?.getAttribute('data-item-name') ?? ''
    const titleMatch = rawTitle.match(/^(.+?)(?:\s*\((\d{4})\))?$/)
    const title = titleMatch?.[1]?.trim() ?? rawTitle
    const year = titleMatch?.[2] ?? ''
    const filmId = lazyPoster?.getAttribute('data-film-id') ?? ''
    const rating = ratingEl?.textContent?.trim() ?? ''

    // Use the resolved src if LazyPoster has updated it; otherwise fall back to
    // data-poster-url so the background worker can fetch + follow the redirect.
    const resolvedSrc = img?.src ?? ''
    const posterUrl = resolvedSrc && !resolvedSrc.includes(PLACEHOLDER)
      ? resolvedSrc
      : `https://letterboxd.com${lazyPoster?.getAttribute('data-poster-url') ?? ''}`

    return { title, year, rating, posterUrl, filmId }
  })
}

// ── Favorites ────────────────────────────────────────────────────────────────
// Scrapes section#favourites on letterboxd.com/<username>/
// Selectors verified against live Letterboxd profile DOM.

export function scrapeFavorites(): FilmData[] {
  return Array.from(
    document.querySelectorAll('section#favourites li.griditem')
  ).slice(0, 4).map(item => {
    const lazyPoster = item.querySelector(
      '.react-component[data-component-class="LazyPoster"]'
    )
    const img = item.querySelector('img.image') as HTMLImageElement | null

    const rawTitle = lazyPoster?.getAttribute('data-item-name') ?? ''
    const titleMatch = rawTitle.match(/^(.+?)(?:\s*\((\d{4})\))?$/)
    const title = titleMatch?.[1]?.trim() ?? rawTitle
    const year = titleMatch?.[2] ?? ''
    const filmId = lazyPoster?.getAttribute('data-film-id') ?? ''

    const resolvedSrc = img?.src ?? ''
    const dataPosterUrl = lazyPoster?.getAttribute('data-poster-url') ?? ''
    const posterUrl = resolvedSrc && !resolvedSrc.includes(PLACEHOLDER)
      ? resolvedSrc
      : dataPosterUrl
        ? `https://letterboxd.com${dataPosterUrl}`
        : ''

    return { title, year, rating: '', posterUrl, filmId }
  })
}

// ── Recent Diary ──────────────────────────────────────────────────────────────
// Scrapes letterboxd.com/<username>/diary/ (table-based layout)
// Selectors verified against live Letterboxd diary DOM.

export function scrapeDiary(count = 4): FilmData[] {
  const rows = Array.from(
    document.querySelectorAll('table#diary-table tbody tr.diary-entry-row')
  ).slice(0, count)

  // Month/year only appear on the first row of each calendar-month group;
  // carry them forward for subsequent rows in the same month.
  let currentMonth = ''
  let currentYear = ''

  return rows.map(row => {
    // ── Film data via LazyPoster (same pattern as scrapeRecentActivity) ──
    const lazyPoster = row.querySelector(
      '.react-component[data-component-class="LazyPoster"]'
    )
    const img = row.querySelector('img.image') as HTMLImageElement | null

    const rawTitle = lazyPoster?.getAttribute('data-item-name') ?? ''
    const titleMatch = rawTitle.match(/^(.+?)(?:\s*\((\d{4})\))?$/)
    const title = titleMatch?.[1]?.trim() ?? rawTitle
    const year = titleMatch?.[2] ?? ''
    const filmId = lazyPoster?.getAttribute('data-film-id') ?? ''

    const resolvedSrc = img?.src ?? ''
    const dataPosterUrl = lazyPoster?.getAttribute('data-poster-url') ?? ''
    const posterUrl = resolvedSrc && !resolvedSrc.includes(PLACEHOLDER)
      ? resolvedSrc
      : dataPosterUrl
        ? `https://letterboxd.com${dataPosterUrl}`
        : ''

    // ── Rating ───────────────────────────────────────────────────────────
    // .hide-for-owner contains the plain star-text span; .show-for-owner
    // has the interactive range input which we don't want.
    const ratingEl = row.querySelector('.col-rating .hide-for-owner .rating')
      ?? row.querySelector('.col-rating .rating')
    const rating = ratingEl?.textContent?.trim() ?? ''

    // ── Date ─────────────────────────────────────────────────────────────
    // Month + year shown only on first row of each month group.
    const monthEl = row.querySelector('.col-monthdate .monthdate a.month')
    const yearEl  = row.querySelector('.col-monthdate .monthdate a.year')
    if (monthEl?.textContent?.trim()) currentMonth = monthEl.textContent.trim()
    if (yearEl?.textContent?.trim())  currentYear  = yearEl.textContent.trim()

    const dayEl = row.querySelector('.col-daydate a.daydate')
    const day = dayEl?.textContent?.trim() ?? ''
    const date = (currentMonth && currentYear && day)
      ? `${currentMonth} ${day}, ${currentYear}`
      : ''

    return { title, year, rating, posterUrl, filmId, date }
  })
}

// ── List ──────────────────────────────────────────────────────────────────────
// Scrapes letterboxd.com/<username>/list/<slug>/ (grid view)
//      or letterboxd.com/<username>/list/<slug>/detail/ (detail view, has ratings)
// count: 4 | 10 | 20

// Letterboxd encodes the owner's rating as data-owner-rating="N" (1–10 scale)
// on li.posteritem in the grid view. Convert to star text for display.
const STAR_MAP = ['½', '★', '★½', '★★', '★★½', '★★★', '★★★½', '★★★★', '★★★★½', '★★★★★']
export function ownerRatingToStars(value: string | null): string {
  if (!value) return ''
  const n = parseInt(value, 10)
  return (n >= 1 && n <= 10) ? STAR_MAP[n - 1] : ''
}

export function scrapeListMeta(): { listTitle: string; listDescription: string; listTags: string[] } {
  const listTitle = document.querySelector('.list-title-intro h1.title-1')?.textContent?.trim() ?? ''
  const paragraphs = Array.from(document.querySelectorAll('.list-title-intro .body-text p'))
  const listDescription = paragraphs
    .map(p => p.textContent?.trim() ?? '')
    .filter(text => text && !text.startsWith('Updated'))
    .join(' ')
  const listTags = Array.from(document.querySelectorAll('ul.tags li a'))
    .map(a => a.textContent?.trim() ?? '')
    .filter(Boolean)
  return { listTitle, listDescription, listTags }
}

export function scrapeList(count: number): FilmData[] {
  // li.posteritem = grid view  |  li.film-detail = detail view (/detail/)
  return Array.from(
    document.querySelectorAll('ul.js-list-entries li.posteritem, ul.js-list-entries li.film-detail')
  ).slice(0, count).map(item => {
    const lazyPoster = item.querySelector(
      '.react-component[data-component-class="LazyPoster"]'
    )
    const img = item.querySelector('img.image') as HTMLImageElement | null

    const rawTitle = lazyPoster?.getAttribute('data-item-name') ?? ''
    const titleMatch = rawTitle.match(/^(.+?)(?:\s*\((\d{4})\))?$/)
    const title = titleMatch?.[1]?.trim() ?? rawTitle
    const year = titleMatch?.[2] ?? ''
    const filmId = lazyPoster?.getAttribute('data-film-id') ?? ''

    const resolvedSrc = img?.src ?? ''
    const dataPosterUrl = lazyPoster?.getAttribute('data-poster-url') ?? ''
    const posterUrl = resolvedSrc && !resolvedSrc.includes(PLACEHOLDER)
      ? resolvedSrc
      : dataPosterUrl
        ? `https://letterboxd.com${dataPosterUrl}`
        : ''

    // Detail view: explicit .rating span. Grid view: data-owner-rating attribute.
    const ratingEl = item.querySelector('.rating')
    const rating = ratingEl?.textContent?.trim()
      || ownerRatingToStars(item.getAttribute('data-owner-rating'))

    return { title, year, rating, posterUrl, filmId }
  })
}

// ── Reviews ───────────────────────────────────────────────────────────────────
// Scrapes review pages: single review (letterboxd.com/<username>/film/<slug>/[n]/)
//                   or reviews list (letterboxd.com/<username>/reviews/)

// innerText is not available in jsdom (tests); fall back to textContent.
// In a real browser, innerText handles <br> → \n; textContent does not, but
// Letterboxd review paragraphs rarely use <br>, so the difference is minor.
function elementText(el: Element): string {
  return ((el as HTMLElement).innerText ?? el.textContent ?? '').trim()
}

// Fetch the full review text from a Letterboxd /s/full-text/ fragment URL.
// Returns the joined paragraph text, or '' on failure.
async function fetchFullText(path: string): Promise<string> {
  try {
    const res = await fetch(`https://letterboxd.com${path}`)
    if (!res.ok) return ''
    const html = await res.text()
    const div = document.createElement('div')
    div.innerHTML = html
    return Array.from(div.querySelectorAll('p'))
      .map(elementText)
      .filter(Boolean)
      .join('\n\n')
  } catch {
    return ''
  }
}

// Single review page scraper.
// Returns an array of 0 or 1 entries (0 when page is not a review).
export async function scrapeReview(): Promise<FilmData[]> {
  const container = document.querySelector('section.viewing-poster-container')
  if (!container) return []

  const lazyPoster = container.querySelector(
    '.react-component[data-component-class="LazyPoster"]'
  )
  const img = container.querySelector('img.image') as HTMLImageElement | null
  const resolvedSrc = img?.src ?? ''
  const dataPosterUrl = lazyPoster?.getAttribute('data-poster-url') ?? ''
  const posterUrl = resolvedSrc && !resolvedSrc.includes(PLACEHOLDER)
    ? resolvedSrc
    : dataPosterUrl ? `https://letterboxd.com${dataPosterUrl}` : ''

  const title = document.querySelector(
    'header.inline-production-masthead h2.primaryname a'
  )?.textContent?.trim() ?? ''
  const year = document.querySelector(
    'header.inline-production-masthead .releasedate a'
  )?.textContent?.trim() ?? ''
  const rating = document.querySelector(
    '.content-reactions-strip span.inline-rating svg'
  )?.getAttribute('aria-label')?.trim() ?? ''

  // Watch date: three <a> links in p.view-date in order: day, month, year
  const dateLinks = Array.from(document.querySelectorAll('p.view-date a'))
  const day   = dateLinks[0]?.textContent?.trim() ?? ''
  const month = dateLinks[1]?.textContent?.trim() ?? ''
  const yr    = dateLinks[2]?.textContent?.trim() ?? ''
  const date = (day && month && yr) ? `${month} ${day}, ${yr}` : ''

  const filmId = lazyPoster?.getAttribute('data-film-id') ?? ''

  const reviewBody = container.closest('body')?.querySelector('.js-review-body')
  const reviewText = reviewBody
    ? Array.from(reviewBody.querySelectorAll('p')).map(elementText).filter(Boolean).join('\n\n')
    : ''

  const tags = Array.from(document.querySelectorAll('ul.tags li a'))
    .map(a => a.textContent?.trim() ?? '')
    .filter(Boolean)

  return [{ title, year, rating, posterUrl, filmId, date, reviewText, tags }]
}

// Reviews list page scraper.
export async function scrapeReviewsList(count: number): Promise<FilmData[]> {
  const items = Array.from(
    document.querySelectorAll('div.viewing-list div.listitem.js-listitem')
  ).slice(0, count)

  return Promise.all(items.map(async (item) => {
    const lazyPoster = item.querySelector(
      '.react-component[data-component-class="LazyPoster"]'
    )
    const img = item.querySelector('img.image') as HTMLImageElement | null
    const resolvedSrc = img?.src ?? ''
    const dataPosterUrl = lazyPoster?.getAttribute('data-poster-url') ?? ''
    const posterUrl = resolvedSrc && !resolvedSrc.includes(PLACEHOLDER)
      ? resolvedSrc
      : dataPosterUrl ? `https://letterboxd.com${dataPosterUrl}` : ''

    const title = item.querySelector(
      'header.inline-production-masthead h2.primaryname a'
    )?.textContent?.trim() ?? ''
    const year = item.querySelector(
      'header.inline-production-masthead .releasedate a'
    )?.textContent?.trim() ?? ''
    const rating = item.querySelector(
      '.content-reactions-strip .inline-rating svg'
    )?.getAttribute('aria-label')?.trim() ?? ''

    // Watch date: ISO datetime attribute (e.g. "2026-03-22") on <time>
    const dateStr = item.querySelector(
      '.content-reactions-strip .date time'
    )?.getAttribute('datetime') ?? ''
    const date = dateStr
      ? new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-US', {
          month: 'short', day: 'numeric', year: 'numeric',
        })
      : ''

    const filmId = lazyPoster?.getAttribute('data-film-id') ?? ''

    // Review text — fetch full text if the review is truncated on the list page
    const reviewBodyEl = item.querySelector('.js-review-body') as HTMLElement | null
    let reviewText = ''
    if (reviewBodyEl) {
      const fullTextUrl = reviewBodyEl.getAttribute('data-full-text-url')
      if (fullTextUrl) {
        reviewText = await fetchFullText(fullTextUrl)
      } else {
        reviewText = Array.from(reviewBodyEl.querySelectorAll('p'))
          .map(elementText)
          .filter(Boolean)
          .join('\n\n')
      }
    }

    const tags = Array.from(item.querySelectorAll('ul.tags li a'))
      .map(a => a.textContent?.trim() ?? '')
      .filter(Boolean)

    return { title, year, rating, posterUrl, filmId, date, reviewText, tags }
  }))
}

// Dispatcher: detects page type from DOM and calls the appropriate scraper.
export async function scrapeReviews(count: number): Promise<FilmDataResponse> {
  const username = (document.body as HTMLBodyElement & { dataset: DOMStringMap }).dataset.owner ?? ''
  const backdropUrl = scrapeBackdropUrl()
  const { username: loggedInUsername, avatarUrl: loggedInAvatarUrl } = scrapeLoggedInUser()
  const authorAvatarUrl = scrapePageOwnerAvatarUrl()
  if (document.querySelector('div.viewing-list')) {
    const films = await scrapeReviewsList(count)
    return { films, username, backdropUrl, loggedInUsername, loggedInAvatarUrl, authorAvatarUrl }
  }
  const films = await scrapeReview()
  return { films, username, backdropUrl, loggedInUsername, loggedInAvatarUrl, authorAvatarUrl }
}

// ── Films page (/<username>/films/) ──────────────────────────────────────────
// Scrapes the first 4 films from the films grid on letterboxd.com/<username>/films/.
// The page defaults to "Recently Watched" order, so the first 4 are the last four watched.
// Selectors follow the standard Letterboxd poster-list pattern used across film grids.

export function scrapeFilmsPage(): FilmData[] {
  return Array.from(
    document.querySelectorAll('ul.poster-list li.poster-container')
  ).slice(0, 4).map(item => {
    const lazyPoster = item.querySelector(
      '.react-component[data-component-class="LazyPoster"]'
    )
    const img = item.querySelector('img.image') as HTMLImageElement | null

    const rawTitle = lazyPoster?.getAttribute('data-item-name') ?? ''
    const titleMatch = rawTitle.match(/^(.+?)(?:\s*\((\d{4})\))?$/)
    const title = titleMatch?.[1]?.trim() ?? rawTitle
    const year = titleMatch?.[2] ?? ''
    const filmId = lazyPoster?.getAttribute('data-film-id') ?? ''

    const resolvedSrc = img?.src ?? ''
    const dataPosterUrl = lazyPoster?.getAttribute('data-poster-url') ?? ''
    const posterUrl = resolvedSrc && !resolvedSrc.includes(PLACEHOLDER)
      ? resolvedSrc
      : dataPosterUrl
        ? `https://letterboxd.com${dataPosterUrl}`
        : ''

    const ratingEl = item.querySelector('.rating')
    const rating = ratingEl?.textContent?.trim() ?? ''

    return { title, year, rating, posterUrl, filmId }
  })
}

// ── Logged-In User ────────────────────────────────────────────────────────────
// Reads the logged-in user's username and avatar from Letterboxd's page-level
// `person` global. Letterboxd sets these as property assignments in an inline
// <head> script: `person.username = "foo"; person.loggedIn = true;`
// Content scripts run in an isolated JS world, so they cannot access page globals
// directly. We use a two-pass strategy:
//
//   1. Direct access — works in test environments (JSDOM shares the global
//      scope) and any future MAIN-world execution context.
//   2. Inline script text parsing — reads textContent of inline <script> tags
//      and extracts values via regex. No execution or injection needed, so
//      it works even when Letterboxd's CSP blocks inline script injection.

export function scrapeLoggedInUser(): { username: string; avatarUrl: string } {
  // Pass 1: direct access (succeeds in JSDOM / MAIN world).
  try {
    // @ts-ignore
    if (typeof person !== 'undefined' && person?.loggedIn && person?.username) {
      // @ts-ignore
      const u: string = person.username
      // @ts-ignore
      const a: string = (person.avatarURL24 || '').replace('0-48-0-48-crop', '0-80-0-80-crop')
      return { username: u, avatarUrl: a }
    }
  } catch { /* fall through */ }

  // Pass 2: parse inline <script> text — works in Chrome's isolated world.
  // Letterboxd writes assignments: person.username = "foo"; person.loggedIn = true;
  // (Some pages may also use JSON object literal format.)
  try {
    const scripts = Array.from(document.querySelectorAll('head script:not([src])'))
    for (const s of scripts) {
      const text = s.textContent ?? ''
      if (!text.includes('person') || !text.includes('loggedIn')) continue
      const loggedInMatch = text.match(/(?:person\.loggedIn\s*=\s*|"loggedIn"\s*:\s*)(true|false)/)
      if (!loggedInMatch || loggedInMatch[1] !== 'true') continue
      const usernameMatch = text.match(/(?:person\.username\s*=\s*|"username"\s*:\s*)"([^"]+)"/)
      const avatarMatch = text.match(/(?:person\.avatarURL24\s*=\s*|"avatarURL24"\s*:\s*)"([^"]+)"/)
      if (!usernameMatch) continue
      const u = usernameMatch[1]
      const a = (avatarMatch?.[1] ?? '').replace('0-48-0-48-crop', '0-80-0-80-crop')
      return { username: u, avatarUrl: a }
    }
  } catch { /* fall through */ }

  return { username: '', avatarUrl: '' }
}

// ── Page Owner Avatar ─────────────────────────────────────────────────────────
// Profile and diary pages render the page owner's avatar in a profile-header
// section. Single review and list pages may not have a visible avatar for the
// owner; in those cases we return empty string and the footer shows username only.
// We also try data-src for lazily-loaded images.

export function scrapePageOwnerAvatarUrl(): string {
  const selectors = [
    '.profile-person-avatar img',
    '.profile-person .avatar img',
    'section.profile-header img.avatar',
    '.profile-summary .avatar img',
    '.person-summary .avatar img',
  ]
  for (const sel of selectors) {
    const el = document.querySelector(sel) as HTMLImageElement | null
    if (!el) continue
    const src = el.getAttribute('data-src') || el.src || ''
    if (src && !src.includes('empty') && !src.includes('placeholder') && src.startsWith('http')) {
      return src.replace('0-48-0-48-crop', '0-80-0-80-crop')
    }
  }
  return ''
}

// ── Backdrop ──────────────────────────────────────────────────────────────────
// Letterboxd review and list pages expose a backdrop image via data attributes
// on a `.backdrop` element (e.g. `<div class="backdrop" data-backdrop-retina="//a.ltrbxd.com/...">`).
// We prefer the retina (2×) URL; both are typically protocol-relative.

export function scrapeBackdropUrl(): string {
  const el = document.querySelector('[data-backdrop-retina], [data-backdrop]')
  if (!el) return ''
  const raw = el.getAttribute('data-backdrop-retina') || el.getAttribute('data-backdrop') || ''
  if (!raw) return ''
  // Protocol-relative → absolute HTTPS
  return raw.startsWith('//') ? `https:${raw}` : raw
}

// ── Message listener ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message: GetFilmDataRequest, _sender, sendResponse) => {
  if (message.type === 'GET_FILM_DATA') {
    if (message.cardType === 'review') {
      scrapeReviews(message.reviewCount ?? 1).then(sendResponse)
      return true
    }

    let films: FilmData[]
    let listMeta: { listTitle?: string; listDescription?: string; listTags?: string[] } = {}
    switch (message.cardType) {
      case 'last-four-watched':
        // Profile page uses #recent-activity; /films/ page uses ul.poster-list
        films = scrapeRecentActivity()
        if (!films.length) films = scrapeFilmsPage()
        break
      case 'favorites':    films = scrapeFavorites();                        break
      case 'recent-diary': films = scrapeDiary(message.listCount ?? 4);      break
      case 'list':
        films = scrapeList(message.listCount ?? 4)
        listMeta = scrapeListMeta()
        break
      default:             films = scrapeRecentActivity();                   break
    }
    const username = (document.body as HTMLBodyElement & { dataset: DOMStringMap }).dataset.owner ?? ''
    sendResponse({ 
      films, 
      username, 
      ...listMeta, 
      backdropUrl: scrapeBackdropUrl(),
      ...(() => { const { username: u, avatarUrl: a } = scrapeLoggedInUser(); return { loggedInUsername: u, loggedInAvatarUrl: a } })(),
      authorAvatarUrl: scrapePageOwnerAvatarUrl(),
    } satisfies FilmDataResponse)
  }
  return true
})
