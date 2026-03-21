import type { CardType, ListCount } from '../types'

export interface FilmData {
  title: string
  year: string
  rating: string
  posterUrl: string
  filmId: string
  date?: string   // ISO-ish date string; populated by scrapeDiary only
}

export interface FilmDataResponse {
  films: FilmData[]
  username: string
}

export interface GetFilmDataRequest {
  type: 'GET_FILM_DATA'
  cardType: CardType
  listCount?: ListCount
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

// ── Shared poster-list helper ─────────────────────────────────────────────────
// Used by Favorites, Top Rated, and List scrapers which all use a similar
// .film-poster / .poster-list DOM pattern.
// TODO: Verify all attribute names and selectors against live Letterboxd DOM.

function extractPosterListItem(item: Element): FilmData {
  const posterEl = item.querySelector('.film-poster') as HTMLElement | null
  const img = item.querySelector('img.image') as HTMLImageElement | null
  const ratingEl = item.querySelector('.rating')

  const rawTitle = posterEl?.getAttribute('data-film-name') ?? ''
  const titleMatch = rawTitle.match(/^(.+?)(?:\s*\((\d{4})\))?$/)
  const title = titleMatch?.[1]?.trim() ?? rawTitle
  const year = titleMatch?.[2] ?? ''
  const filmId = posterEl?.getAttribute('data-film-id') ?? ''
  const dataPosterUrl = posterEl?.getAttribute('data-poster-url') ?? ''
  const rating = ratingEl?.textContent?.trim() ?? ''

  const resolvedSrc = img?.src ?? ''
  const posterUrl = resolvedSrc && !resolvedSrc.includes(PLACEHOLDER)
    ? resolvedSrc
    : dataPosterUrl
      ? `https://letterboxd.com${dataPosterUrl}`
      : ''

  return { title, year, rating, posterUrl, filmId }
}

// ── Favorites ────────────────────────────────────────────────────────────────
// TODO: Verify selector against live DOM.

export function scrapeFavorites(): FilmData[] {
  return Array.from(
    document.querySelectorAll('section#favourites ul.poster-list li')
  ).slice(0, 4).map(extractPosterListItem)
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
// Scrapes letterboxd.com/<username>/list/<slug>/
// count: 4 | 10 | 20
// TODO: Verify selector against live DOM.

export function scrapeList(count: number): FilmData[] {
  return Array.from(
    document.querySelectorAll('ul.film-list li.poster-container')
  ).slice(0, count).map(extractPosterListItem)
}

// ── Message listener ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message: GetFilmDataRequest, _sender, sendResponse) => {
  if (message.type === 'GET_FILM_DATA') {
    let films: FilmData[]
    switch (message.cardType) {
      case 'favorites':    films = scrapeFavorites();                        break
      case 'recent-diary': films = scrapeDiary(message.listCount ?? 4);      break
      case 'list':         films = scrapeList(message.listCount ?? 4);       break
      default:             films = scrapeRecentActivity();                   break
    }
    const username = (document.body as HTMLBodyElement & { dataset: DOMStringMap }).dataset.owner ?? ''
    sendResponse({ films, username } satisfies FilmDataResponse)
  }
  return true
})
