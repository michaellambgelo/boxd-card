export interface FilmData {
  title: string
  year: string
  rating: string
  posterUrl: string
  filmId: string
}

export interface FilmDataResponse {
  films: FilmData[]
  username: string
}

const PLACEHOLDER = 'empty-poster-150'

function scrapeFilms(): FilmData[] {
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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_FILM_DATA') {
    const films = scrapeFilms()
    const username = (document.body as HTMLBodyElement & { dataset: DOMStringMap }).dataset.owner ?? ''
    sendResponse({ films, username } satisfies FilmDataResponse)
  }
  return true
})
