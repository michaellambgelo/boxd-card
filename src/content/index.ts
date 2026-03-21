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
  listTitle?: string
  listDescription?: string
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
// Scrapes letterboxd.com/<username>/list/<slug>/
// count: 4 | 10 | 20
// Selectors verified against live Letterboxd list DOM.

export function scrapeListMeta(): { listTitle: string; listDescription: string } {
  const listTitle = document.querySelector('.list-title-intro h1.title-1')?.textContent?.trim() ?? ''
  const paragraphs = Array.from(document.querySelectorAll('.list-title-intro .body-text p'))
  const listDescription = paragraphs
    .map(p => p.textContent?.trim() ?? '')
    .filter(text => text && !text.startsWith('Updated'))
    .join(' ')
  return { listTitle, listDescription }
}

export function scrapeList(count: number): FilmData[] {
  return Array.from(
    document.querySelectorAll('ul.js-list-entries li.posteritem')
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

    return { title, year, rating: '', posterUrl, filmId }
  })
}

// ── Message listener ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message: GetFilmDataRequest, _sender, sendResponse) => {
  if (message.type === 'GET_FILM_DATA') {
    let films: FilmData[]
    let listMeta: { listTitle?: string; listDescription?: string } = {}
    switch (message.cardType) {
      case 'favorites':    films = scrapeFavorites();                        break
      case 'recent-diary': films = scrapeDiary(message.listCount ?? 4);      break
      case 'list':
        films = scrapeList(message.listCount ?? 4)
        listMeta = scrapeListMeta()
        break
      default:             films = scrapeRecentActivity();                   break
    }
    const username = (document.body as HTMLBodyElement & { dataset: DOMStringMap }).dataset.owner ?? ''
    sendResponse({ films, username, ...listMeta } satisfies FilmDataResponse)
  }
  return true
})
