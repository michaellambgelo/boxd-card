import type { CardType, ListCount, ReviewCount, StatsCategory, StatsSubCategory } from '../types'

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

export interface StatEntry { value: string; label: string }

export interface WeekEntry { week: string; label: string; count: number }

export interface BreakdownData {
  pieRatios: { total: number; rewatched: number; releasedThisYear: number; reviewed: number }
  ratingSpread: number[]
  watchlist: { watched: number; added: number }
  year?: string
}

export interface ChartDataSet {
  weeklyFilms?: WeekEntry[]
  weeklyLists?: WeekEntry[]
  dayOfWeek?: { day: string; count: number }[]
  summaryNumbers?: StatEntry[]
}

export interface BarChartEntry { label: string; count: number; percent: number }

export interface BarChartData {
  category: string
  subCategory: string
  bars: BarChartEntry[]
}

export interface MilestoneFilm {
  title: string; year: string; rating: string; posterUrl: string; filmId: string
  label: string   // "First Film", "Last Film", "50th", etc.
  date: string     // "Jan 3", "Mar 18", etc.
}

export interface MilestonesData {
  firstFilm?: MilestoneFilm
  lastFilm?: MilestoneFilm
  diaryMilestones: MilestoneFilm[]
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
  statsSummary?: StatEntry[]
  statsTitle?: string
  statsSubtitle?: string
  chartData?: ChartDataSet
  breakdownData?: BreakdownData
  barChartData?: BarChartData
  milestonesData?: MilestonesData
}

export interface GetFilmDataRequest {
  type: 'GET_FILM_DATA'
  cardType: CardType
  listCount?: ListCount
  reviewCount?: ReviewCount
  statsCategory?: StatsCategory
  statsSubCategory?: StatsSubCategory
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
// Selector: div.poster-grid > ul.grid li.griditem (matches actual /films/ page HTML).

export function scrapeFilmsPage(): FilmData[] {
  return Array.from(
    document.querySelectorAll('ul.grid li.griditem')
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

// ── Stats page scrapers ──────────────────────────────────────────────────────

// Stats sections are CSI-loaded. LazyPoster may or may not have data-poster-url.
// Try multiple strategies to get a usable poster URL:
//   1. img.src if not the empty-poster placeholder
//   2. data-poster-url on LazyPoster
//   3. Construct from data-item-link (e.g. "/film/midsommar/" → "/film/midsommar/image-150/")
//   4. Construct from data-item-slug
function statsPosterUrl(img: HTMLImageElement | null, lazy: Element | null): string {
  const resolvedSrc = img?.src ?? ''
  if (resolvedSrc && !resolvedSrc.includes(PLACEHOLDER)) return resolvedSrc

  const dataPosterUrl = lazy?.getAttribute('data-poster-url') ?? ''
  if (dataPosterUrl) return `https://letterboxd.com${dataPosterUrl}`

  const itemLink = lazy?.getAttribute('data-item-link') ?? ''
  if (itemLink) return `https://letterboxd.com${itemLink}image-150/`

  const itemSlug = lazy?.getAttribute('data-item-slug') ?? ''
  if (itemSlug) return `https://letterboxd.com/film/${itemSlug}/image-150/`

  return ''
}

// Scroll a stats section into view and wait for CSI to load and LazyPoster to
// resolve poster images. LazyPoster only initialises when elements enter the
// viewport, so we must scroll each entry into view before scraping.
async function ensureStatsSectionLoaded(sectionSelector: string, childSelector: string): Promise<void> {
  const section = document.querySelector(sectionSelector)
  if (!section) return

  // Phase 1: Scroll section into view to trigger CSI loading
  section.scrollIntoView({ behavior: 'instant', block: 'center' })

  // Wait up to 3 seconds for CSI content to appear
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 100))
    if (section.querySelectorAll(childSelector).length) break
  }

  // Phase 2: Scroll through each child element to trigger LazyPoster init.
  // LazyPoster only populates data-item-name when the element enters the
  // viewport, so scrolling the section top alone leaves off-screen entries empty.
  const children = Array.from(section.querySelectorAll(childSelector))
  for (const child of children) {
    child.scrollIntoView({ behavior: 'instant', block: 'center' })
    // Brief pause so LazyPoster observer fires
    await new Promise(r => setTimeout(r, 50))
  }

  // Phase 3: Wait for at least some poster images to resolve
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 100))
    const imgs = Array.from(section.querySelectorAll('img.image')) as HTMLImageElement[]
    if (imgs.some(img => img.src && !img.src.includes(PLACEHOLDER))) break
  }
}

// Top Films section: poster list with LazyPoster data (static HTML, not CSI-loaded)
export function scrapeStatsTopFilms(count: number = 20): FilmData[] {
  // The first visible tab section contains the All Time top films
  const section = document.querySelector('section.yir-top-ten.-show ul.posters')
    ?? document.querySelector('section.yir-top-ten ul.posters')
  if (!section) return []

  const items = Array.from(section.querySelectorAll('li')).slice(0, count)
  return items.map((item) => {
    const lazy = item.querySelector('.react-component[data-component-class="LazyPoster"]')
    const img = item.querySelector('img.image') as HTMLImageElement | null

    const rawTitle = lazy?.getAttribute('data-item-name') ?? ''
    const titleMatch = rawTitle.match(/^(.+?)(?:\s*\((\d{4})\))?$/)
    const title = titleMatch?.[1]?.trim() ?? rawTitle
    const year = titleMatch?.[2] ?? ''
    const filmId = lazy?.getAttribute('data-film-id') ?? ''

    const posterUrl = statsPosterUrl(img, lazy)

    return { title, year, rating: '', posterUrl, filmId }
  })
}

// Most Watched section: CSI-loaded poster grid with rewatch counts
// The CSI endpoint populates div.yir-most-rewatched with LazyPoster components.
// By document_idle the CSI may have completed; if not, we fall back to empty.
export function scrapeStatsMostWatched(count: number = 20): FilmData[] {
  const container = document.querySelector('.yir-most-rewatched')
  if (!container) return []

  const grids = Array.from(container.querySelectorAll('.yir-poster-grid')).slice(0, count)
  return grids.map((grid) => {
    const lazy = grid.querySelector('.react-component[data-component-class="LazyPoster"]')
    const img = (grid.querySelector('img.image') ?? grid.querySelector('.film-poster img') ?? grid.querySelector('img')) as HTMLImageElement | null
    const detail = grid.querySelector('.yir-label.-detail')?.textContent?.trim() ?? ''

    const rawTitle = lazy?.getAttribute('data-item-name') ?? ''
    const titleMatch = rawTitle.match(/^(.+?)(?:\s*\((\d{4})\))?$/)
    const title = titleMatch?.[1]?.trim() ?? rawTitle
    const year = titleMatch?.[2] ?? ''
    const filmId = lazy?.getAttribute('data-film-id') ?? ''

    const posterUrl = statsPosterUrl(img, lazy)

    return { title, year, rating: detail, posterUrl, filmId }
  }).filter(f => f.title)
}

// Rated higher/lower than average (Patron): CSI-loaded poster grids
export function scrapeStatsHighestRated(count: number = 12): FilmData[] {
  // "Rated higher than average" section
  const header = Array.from(document.querySelectorAll('a[name="variance-high"]'))
  const section = header[0]?.closest('section')
  if (!section) return []

  const grids = Array.from(section.querySelectorAll('.yir-poster-grid')).slice(0, count)
  return grids.map((grid) => {
    const lazy = grid.querySelector('.react-component[data-component-class="LazyPoster"]')
    const img = (grid.querySelector('img.image') ?? grid.querySelector('.film-poster img') ?? grid.querySelector('img')) as HTMLImageElement | null
    const detail = grid.querySelector('.yir-label.-detail')?.textContent?.trim() ?? ''

    const rawTitle = lazy?.getAttribute('data-item-name') ?? ''
    const titleMatch = rawTitle.match(/^(.+?)(?:\s*\((\d{4})\))?$/)
    const title = titleMatch?.[1]?.trim() ?? rawTitle
    const year = titleMatch?.[2] ?? ''
    const filmId = lazy?.getAttribute('data-film-id') ?? ''

    const posterUrl = statsPosterUrl(img, lazy)

    return { title, year, rating: detail, posterUrl, filmId }
  }).filter(f => f.title)
}

// ── Year page scrapers (/username/year/YYYY/) ───────────────────────────────
// The year page has a completely different DOM structure from the all-time stats
// page: inline sections instead of CSI-loaded content, grid items instead of
// yir-poster-grid elements, and data-owner-rating instead of yir-label.-detail.

function isYearPage(): boolean {
  return /\/year\/\d{4}\/?$/.test(window.location.pathname)
}

// Most Watched (Milestones) on the year page:
// div.milestone-mostwatched > div.milestone-list > div.listitem
// Each listitem has div.poster-container[data-owner-rating] with LazyPoster,
// plus a rewatch count label (e.g. "4 times", "Twice").
export function scrapeYearMostWatched(count: number = 20): FilmData[] {
  const container = document.querySelector('div.milestone-mostwatched')
  if (!container) return []

  const items = Array.from(container.querySelectorAll('div.listitem')).slice(0, count)
  return items.map((item) => {
    const posterContainer = item.querySelector('div.poster-container')
    const lazy = item.querySelector('.react-component[data-component-class="LazyPoster"]')
    const img = item.querySelector('img.image') as HTMLImageElement | null

    const rawTitle = lazy?.getAttribute('data-item-name') ?? ''
    const titleMatch = rawTitle.match(/^(.+?)(?:\s*\((\d{4})\))?$/)
    const title = titleMatch?.[1]?.trim() ?? rawTitle
    const year = titleMatch?.[2] ?? ''
    const filmId = lazy?.getAttribute('data-film-id') ?? ''

    const posterUrl = statsPosterUrl(img, lazy)

    // data-owner-rating on the poster-container; rewatch count in a label
    const rating = ownerRatingToStars(posterContainer?.getAttribute('data-owner-rating') ?? null)

    return { title, year, rating, posterUrl, filmId }
  }).filter(f => f.title)
}

// Milestones: First Film, Last Film, and diary milestones (50th, 100th, etc.)
// Container: .milestone-group.-diaryevents
function extractMilestoneFilm(el: Element, label: string, date: string): MilestoneFilm | null {
  const posterContainer = el.querySelector('.poster-container')
  const lazy = el.querySelector('.react-component[data-component-class="LazyPoster"]')
  const img = el.querySelector('img.image') as HTMLImageElement | null

  const rawTitle = lazy?.getAttribute('data-item-name') ?? ''
  const titleMatch = rawTitle.match(/^(.+?)(?:\s*\((\d{4})\))?$/)
  const title = titleMatch?.[1]?.trim() ?? rawTitle
  const year = titleMatch?.[2] ?? ''
  const filmId = lazy?.getAttribute('data-film-id') ?? ''
  const posterUrl = statsPosterUrl(img, lazy)
  const rating = ownerRatingToStars(posterContainer?.getAttribute('data-owner-rating') ?? null)

  if (!title) return null
  return { title, year, rating, posterUrl, filmId, label, date }
}

export function scrapeMilestones(): MilestonesData {
  const container = document.querySelector('.milestone-group.-diaryevents')
  if (!container) return { diaryMilestones: [] }

  const earliest = container.querySelector('.chronologicalentry.-earliest')
  const newest = container.querySelector('.chronologicalentry.-newest')

  const firstFilm = earliest
    ? extractMilestoneFilm(
        earliest,
        earliest.querySelector('h3.yir-title-label')?.textContent?.trim() ?? 'First Film',
        earliest.querySelector('p.yir-label.-detail')?.textContent?.trim() ?? '',
      )
    : undefined

  const lastFilm = newest
    ? extractMilestoneFilm(
        newest,
        newest.querySelector('h3.yir-title-label')?.textContent?.trim() ?? 'Last Film',
        newest.querySelector('p.yir-label.-detail')?.textContent?.trim() ?? '',
      )
    : undefined

  const diaryMilestones: MilestoneFilm[] = []
  for (const item of Array.from(container.querySelectorAll('.milestone-diaryevents .milestone-list .listitem:not(.-placeholder)'))) {
    const milestoneLabel = item.querySelector('.milestonetitle')?.textContent?.trim() ?? ''
    const viewingDate = item.querySelector('.viewingdate')?.textContent?.trim() ?? ''
    const film = extractMilestoneFilm(item, milestoneLabel, viewingDate)
    if (film) diaryMilestones.push(film)
  }

  return { firstFilm: firstFilm ?? undefined, lastFilm: lastFilm ?? undefined, diaryMilestones }
}

// ── Stats header (shared by all non-poster stats categories) ─────────────────

function scrapeStatsHeader(): { statsTitle: string; statsSubtitle: string } {
  const titleEl = document.querySelector('h1.yir-member-title')
  // Text content only — ignore child <a> popmenu link
  const statsTitle = titleEl?.childNodes[0]?.textContent?.trim() ?? ''

  const subtitleEl = document.querySelector('h3.yir-member-subtitle')
  const statsSubtitle = (subtitleEl?.textContent ?? '')
    .replace(/\u00a0/g, ' ')  // &nbsp; → space
    .replace(/\s+/g, ' ')
    .trim()

  return { statsTitle, statsSubtitle }
}

// ── Summary scraper ──────────────────────────────────────────────────────────

function scrapeStatsSummary(): Partial<FilmDataResponse> {
  const stats = Array.from(
    document.querySelectorAll('.yir-member-stats .yir-member-statistic')
  )

  const statsSummary: StatEntry[] = stats.map(el => ({
    value: el.querySelector('span.value')?.textContent?.trim() ?? '',
    label: el.querySelector('span.definition')?.textContent?.trim() ?? '',
  })).filter(s => s.value && s.label)

  return { statsSummary, ...scrapeStatsHeader() }
}

// ── Breakdown scraper (pie ratios + rating spread + watchlist) ────────────────

function scrapeBreakdown(): Partial<FilmDataResponse> {
  const piesEl = document.querySelector('.js-personal-pies[data-ratios]')
  let pieRatios = { total: 0, rewatched: 0, releasedThisYear: 0, reviewed: 0 }
  if (piesEl) {
    try { pieRatios = JSON.parse(piesEl.getAttribute('data-ratios') ?? '{}') } catch { /* */ }
  }

  const ratingEl = document.querySelector('#ratingspread[data-column-chart-options]')
  let ratingSpread: number[] = []
  if (ratingEl) {
    try {
      const opts = JSON.parse(ratingEl.getAttribute('data-column-chart-options') ?? '{}')
      ratingSpread = Array.isArray(opts.data) ? opts.data : []
    } catch { /* */ }
  }

  // Watchlist: strong.yir-number contains icon span text + count, e.g. "Watched 31"
  const watchlistPanel = document.querySelector('.yir-watchlist .yir-watchlist-panel')
  const watchedText = watchlistPanel?.querySelector('strong.yir-number')?.textContent ?? ''
  const watched = parseInt(watchedText.replace(/\D/g, ''), 10) || 0
  const addedText = watchlistPanel?.querySelector('.yir-watchlist-added .yir-number')?.textContent ?? ''
  const added = parseInt(addedText.replace(/\D/g, ''), 10) || 0

  const header = scrapeStatsHeader()
  const year = header.statsTitle.match(/^\d{4}$/)?.[0]

  return {
    breakdownData: { pieRatios, ratingSpread, watchlist: { watched, added }, year },
    ...header,
  }
}

// ── By-week scraper (weekly films + day-of-week + summary numbers) ───────────

function parseChartOptions(selector: string): { item: string; name: string; y: number; value: number }[] {
  const el = document.querySelector(selector)
  if (!el) return []
  try {
    const opts = JSON.parse(el.getAttribute('data-column-chart-options') ?? '{}')
    return Array.isArray(opts.data) ? opts.data : []
  } catch { return [] }
}

function scrapeByWeek(): Partial<FilmDataResponse> {
  const weeklyFilmsRaw = parseChartOptions('#entries-by-week-films .js-viewings-per-week-of-year-chart[data-column-chart-options]')
  const weeklyFilms: WeekEntry[] = weeklyFilmsRaw.map(w => ({
    week: w.item,
    label: w.name.replace(/<br\/?>/g, ' ').replace(/\u2014/g, '–'),
    count: w.y,
  }))

  const weeklyListsRaw = parseChartOptions('#entries-by-week-lists .js-film-lists-per-week-of-year-chart[data-column-chart-options]')
  const weeklyLists: WeekEntry[] = weeklyListsRaw.map(w => ({
    week: w.item,
    label: w.name.replace(/<br\/?>/g, ' ').replace(/\u2014/g, '–'),
    count: w.y,
  }))

  const dayOfWeekRaw = parseChartOptions('#entries-by-week-films .js-viewings-per-day-of-the-week-chart[data-column-chart-options]')
  const dayOfWeek = dayOfWeekRaw.map(d => ({ day: d.name, count: d.y }))

  const summaryItems = Array.from(
    document.querySelectorAll('#entries-by-week-films .yir-time-data .yir-numbers ul li')
  )
  const summaryNumbers: StatEntry[] = summaryItems.map(li => ({
    value: li.querySelector('strong')?.textContent?.trim() ?? '',
    label: li.querySelector('span.yir-label')?.textContent?.trim() ?? '',
  })).filter(s => s.value && s.label)

  return {
    chartData: { weeklyFilms, weeklyLists, dayOfWeek, summaryNumbers },
    ...scrapeStatsHeader(),
  }
}

// ── Bar chart scraper (genres / countries / languages) ───────────────────────

function scrapeBarChart(category: string, subCategory: string): Partial<FilmDataResponse> {
  const tabId = `#${category}-${subCategory}`
  const section = document.querySelector(tabId)
  if (!section) return { barChartData: { category, subCategory, bars: [] }, ...scrapeStatsHeader() }

  const bars = Array.from(
    section.querySelectorAll(`.yir-${category} .film-breakdown-graph-bar`)
  ).map(bar => {
    const label = bar.querySelector('.film-breakdown-graph-bar-label')?.textContent?.trim() ?? ''
    const valueEl = bar.querySelector('.film-breakdown-graph-bar-value')
    const count = parseInt(valueEl?.getAttribute('data-count') ?? '0', 10)
    const percent = parseFloat(valueEl?.getAttribute('data-normalised-percent') ?? '0')
    return { label, count, percent }
  }).filter(b => b.label)

  return {
    barChartData: { category, subCategory, bars },
    ...scrapeStatsHeader(),
  }
}

// Async stats dispatcher: scrolls the target section into view so CSI loads
// and LazyPoster resolves poster images, then scrapes.
// Detects year page vs all-time stats page and uses the appropriate scrapers.
async function scrapeStatsAsync(
  category: StatsCategory,
  count: number,
  subCategory: string = 'most-watched',
): Promise<FilmDataResponse> {
  const scrollY = window.scrollY

  let films: FilmData[] = []
  let extra: Partial<FilmDataResponse> = {}

  switch (category) {
    case 'summary':
      extra = scrapeStatsSummary()
      break
    case 'breakdown':
      extra = scrapeBreakdown()
      break
    case 'by-week':
      extra = scrapeByWeek()
      break
    case 'genres':
    case 'countries':
    case 'languages':
      extra = scrapeBarChart(category, subCategory)
      break
    case 'milestones':
      await ensureStatsSectionLoaded('.milestone-group.-diaryevents', '.chronologicalentry')
      extra = { milestonesData: scrapeMilestones(), ...scrapeStatsHeader() }
      break
    case 'most-watched':
      if (isYearPage()) {
        // Year page: milestones section with rewatched films
        await ensureStatsSectionLoaded('div.milestone-mostwatched', 'div.listitem')
        films = scrapeYearMostWatched(count)
      } else {
        // All-time stats: CSI-loaded most-rewatched section
        await ensureStatsSectionLoaded('.yir-most-rewatched', '.yir-poster-grid')
        films = scrapeStatsMostWatched(count)
        if (!films.length) films = scrapeStatsTopFilms(count)
      }
      break
    case 'highest-rated':
      // Same DOM structure on both year and all-time pages:
      // a[name="variance-high"] → .yir-most-variance → .yir-poster-grid
      await ensureStatsSectionLoaded('.yir-most-variance', '.yir-poster-grid')
      films = scrapeStatsHighestRated(count)
      if (!films.length) films = scrapeStatsTopFilms(count)
      break
    default:
      films = []
      break
  }

  // Restore scroll position
  window.scrollTo({ top: scrollY, behavior: 'instant' })

  const username = (document.body as HTMLBodyElement & { dataset: DOMStringMap }).dataset.owner ?? ''
  const { username: loggedInUsername, avatarUrl: loggedInAvatarUrl } = scrapeLoggedInUser()
  return {
    films,
    username,
    backdropUrl: scrapeBackdropUrl(),
    loggedInUsername,
    loggedInAvatarUrl,
    authorAvatarUrl: scrapePageOwnerAvatarUrl(),
    ...extra,
  }
}

// ── Message listener ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message: GetFilmDataRequest, _sender, sendResponse) => {
  if (message.type === 'GET_FILM_DATA') {
    if (message.cardType === 'review') {
      scrapeReviews(message.reviewCount ?? 1).then(sendResponse)
      return true
    }

    if (message.cardType === 'stats') {
      scrapeStatsAsync(
        message.statsCategory ?? 'most-watched',
        message.listCount ?? 10,
        message.statsSubCategory ?? 'most-watched',
      ).then(sendResponse)
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
