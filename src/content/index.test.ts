import { describe, it, expect, beforeEach } from 'vitest'
import {
  scrapeRecentActivity,
  scrapeFavorites,
  scrapeDiary,
  scrapeList,
} from './index'

const PLACEHOLDER = 'empty-poster-150-DtnLDE3k.png'
const REAL_POSTER = 'https://a.ltrbxd.com/resized/film-poster/dune-0-150-0-225-crop.jpg'

// ── DOM helpers ───────────────────────────────────────────────────────────────

interface FilmOverrides {
  name?: string
  slug?: string
  filmId?: string
  posterUrl?: string
  imgSrc?: string
  rating?: string
}

function makeFilmItem(overrides: FilmOverrides = {}): string {
  const {
    name = 'Dune (2021)',
    slug = 'dune-2021',
    filmId = '371378',
    posterUrl = `/film/${slug}/image-150/`,
    imgSrc = REAL_POSTER,
    rating = '★★★★',
  } = overrides
  return `
    <li class="griditem">
      <div class="viewing-poster-container">
        <div class="react-component"
          data-component-class="LazyPoster"
          data-item-name="${name}"
          data-item-slug="${slug}"
          data-film-id="${filmId}"
          data-poster-url="${posterUrl}">
          <div class="poster film-poster">
            <img class="image" src="${imgSrc}" />
          </div>
        </div>
        <p class="poster-viewingdata" data-item-uid="film:${filmId}">
          <span class="rating">${rating}</span>
        </p>
      </div>
    </li>`
}

function setRecentActivityDOM(items: string[]) {
  document.body.innerHTML = `
    <section id="recent-activity">
      <ul class="grid -p150">
        ${items.join('')}
      </ul>
    </section>`
}

// Poster-list item used by Favorites and List scrapers
interface PosterListOverrides {
  name?: string
  filmId?: string
  posterUrl?: string
  imgSrc?: string
  rating?: string
}

function makePosterListItem(overrides: PosterListOverrides = {}): string {
  const {
    name = 'Dune (2021)',
    filmId = '371378',
    posterUrl = '/film/dune-2021/image-150/',
    imgSrc = REAL_POSTER,
    rating = '★★★★',
  } = overrides
  return `
    <li class="poster-container">
      <div class="film-poster"
        data-film-name="${name}"
        data-film-id="${filmId}"
        data-poster-url="${posterUrl}">
        <img class="image" src="${imgSrc}" />
      </div>
      <p class="poster-viewingdata">
        <span class="rating">${rating}</span>
      </p>
    </li>`
}

beforeEach(() => {
  document.body.innerHTML = ''
})

// ── scrapeRecentActivity ──────────────────────────────────────────────────────

describe('scrapeRecentActivity', () => {
  it('returns [] when #recent-activity is absent', () => {
    document.body.innerHTML = '<div>nothing here</div>'
    expect(scrapeRecentActivity()).toEqual([])
  })

  it('returns [] when section has no li.griditem children', () => {
    document.body.innerHTML = '<section id="recent-activity"><ul class="grid -p150"></ul></section>'
    expect(scrapeRecentActivity()).toEqual([])
  })

  it('extracts title (without year), year, rating, and filmId', () => {
    setRecentActivityDOM([makeFilmItem()])
    const [film] = scrapeRecentActivity()
    expect(film.title).toBe('Dune')
    expect(film.year).toBe('2021')
    expect(film.rating).toBe('★★★★')
    expect(film.filmId).toBe('371378')
  })

  it('uses resolved img.src as posterUrl when it is not the placeholder', () => {
    setRecentActivityDOM([makeFilmItem({ imgSrc: REAL_POSTER })])
    const [film] = scrapeRecentActivity()
    expect(film.posterUrl).toBe(REAL_POSTER)
  })

  it('falls back to data-poster-url when img.src contains the placeholder', () => {
    setRecentActivityDOM([
      makeFilmItem({
        imgSrc: `https://s.ltrbxd.com/static/img/${PLACEHOLDER}`,
        posterUrl: '/film/dune-2021/image-150/',
      }),
    ])
    const [film] = scrapeRecentActivity()
    expect(film.posterUrl).toBe('https://letterboxd.com/film/dune-2021/image-150/')
  })

  it('caps results at 4 even when more items exist', () => {
    setRecentActivityDOM(Array.from({ length: 6 }, (_, i) =>
      makeFilmItem({ name: `Film ${i} (202${i})`, filmId: `${i}` })
    ))
    expect(scrapeRecentActivity()).toHaveLength(4)
  })

  it('returns empty string for rating when rating element is absent', () => {
    document.body.innerHTML = `
      <section id="recent-activity">
        <ul class="grid -p150">
          <li class="griditem">
            <div class="viewing-poster-container">
              <div class="react-component"
                data-component-class="LazyPoster"
                data-item-name="No Rating Film (2024)"
                data-film-id="999"
                data-poster-url="/film/no-rating/image-150/">
                <div class="poster film-poster">
                  <img class="image" src="${REAL_POSTER}" />
                </div>
              </div>
              <p class="poster-viewingdata" data-item-uid="film:999"></p>
            </div>
          </li>
        </ul>
      </section>`
    const [film] = scrapeRecentActivity()
    expect(film.rating).toBe('')
  })
})

// ── scrapeFavorites ───────────────────────────────────────────────────────────

describe('scrapeFavorites', () => {
  function setFavoritesDOM(items: string[]) {
    document.body.innerHTML = `
      <section id="favourites">
        <ul class="poster-list">
          ${items.join('')}
        </ul>
      </section>`
  }

  it('returns [] when section#favourites is absent', () => {
    document.body.innerHTML = '<div>nothing</div>'
    expect(scrapeFavorites()).toEqual([])
  })

  it('extracts up to 4 films from #favourites', () => {
    setFavoritesDOM(Array.from({ length: 5 }, (_, i) =>
      makePosterListItem({ name: `Film ${i} (202${i})`, filmId: `${i}` })
    ))
    expect(scrapeFavorites()).toHaveLength(4)
  })

  it('extracts title, year, filmId, and rating', () => {
    setFavoritesDOM([makePosterListItem()])
    const [film] = scrapeFavorites()
    expect(film.title).toBe('Dune')
    expect(film.year).toBe('2021')
    expect(film.filmId).toBe('371378')
    expect(film.rating).toBe('★★★★')
  })

  it('uses resolved img.src when not a placeholder', () => {
    setFavoritesDOM([makePosterListItem({ imgSrc: REAL_POSTER })])
    const [film] = scrapeFavorites()
    expect(film.posterUrl).toBe(REAL_POSTER)
  })

  it('falls back to data-poster-url when img.src is a placeholder', () => {
    setFavoritesDOM([
      makePosterListItem({
        imgSrc: `https://s.ltrbxd.com/static/img/${PLACEHOLDER}`,
        posterUrl: '/film/dune-2021/image-150/',
      }),
    ])
    const [film] = scrapeFavorites()
    expect(film.posterUrl).toBe('https://letterboxd.com/film/dune-2021/image-150/')
  })
})

// ── scrapeDiary ───────────────────────────────────────────────────────────────

describe('scrapeDiary', () => {
  const EMPTY_POSTER = 'https://s.ltrbxd.com/static/img/empty-poster-35-abc.png'

  interface DiaryRowOpts {
    title?: string
    filmId?: string
    posterUrl?: string
    imgSrc?: string
    rating?: string
    /** month text e.g. 'Mar' — omit to simulate a non-first row in the month */
    month?: string | null
    year?: string | null
    day?: string
  }

  function makeDiaryRow(opts: DiaryRowOpts = {}): string {
    const {
      title    = 'Dune (2021)',
      filmId   = '371378',
      posterUrl = '/film/dune-2021/image-150/',
      imgSrc   = REAL_POSTER,
      rating   = '★★★★',
      month    = 'Mar',
      year     = '2026',
      day      = '20',
    } = opts

    const monthCell = (month !== null && year !== null)
      ? `<div class="monthdate"><a class="month" href="#">${month}</a><a class="year" href="#">${year}</a></div>`
      : ''

    return `
      <tr class="diary-entry-row">
        <td class="col-film">
          <div class="react-component" data-component-class="LazyPoster"
               data-item-name="${title}"
               data-film-id="${filmId}"
               data-poster-url="${posterUrl}">
            <img class="image" src="${imgSrc}" />
          </div>
        </td>
        <td class="col-rating">
          <div class="show-for-owner"><input type="range" /></div>
          <div class="hide-for-owner"><span class="rating">${rating}</span></div>
        </td>
        <td class="col-monthdate">${monthCell}</td>
        <td class="col-daydate"><a class="daydate" href="#">${day}</a></td>
      </tr>`
  }

  function setDiaryDOM(rows: string[]) {
    document.body.innerHTML = `
      <table id="diary-table">
        <tbody>
          ${rows.join('')}
        </tbody>
      </table>`
  }

  it('returns [] when #diary-table is absent', () => {
    document.body.innerHTML = '<div>nothing</div>'
    expect(scrapeDiary()).toEqual([])
  })

  it('extracts title, year, rating, and date', () => {
    setDiaryDOM([makeDiaryRow()])
    const [film] = scrapeDiary()
    expect(film.title).toBe('Dune')
    expect(film.year).toBe('2021')
    expect(film.rating).toBe('★★★★')
    expect(film.date).toBe('Mar 20, 2026')
  })

  it('populates posterUrl from img.src when not a placeholder', () => {
    setDiaryDOM([makeDiaryRow({ imgSrc: REAL_POSTER })])
    const [film] = scrapeDiary()
    expect(film.posterUrl).toBe(REAL_POSTER)
  })

  it('falls back to data-poster-url when img.src is empty-poster', () => {
    setDiaryDOM([makeDiaryRow({ imgSrc: EMPTY_POSTER })])
    const [film] = scrapeDiary()
    expect(film.posterUrl).toBe('https://letterboxd.com/film/dune-2021/image-150/')
  })

  it('carries month/year forward for rows with empty col-monthdate', () => {
    setDiaryDOM([
      makeDiaryRow({ day: '20' }),                        // has month+year
      makeDiaryRow({ month: null, year: null, day: '19' }), // inherits Mar 2026
    ])
    const films = scrapeDiary(10)
    expect(films[0].date).toBe('Mar 20, 2026')
    expect(films[1].date).toBe('Mar 19, 2026')
  })

  it('caps results at 4 rows by default', () => {
    setDiaryDOM(Array.from({ length: 6 }, () => makeDiaryRow()))
    expect(scrapeDiary()).toHaveLength(4)
  })
})

// ── scrapeList ────────────────────────────────────────────────────────────────

describe('scrapeList', () => {
  function setListDOM(items: string[]) {
    document.body.innerHTML = `
      <ul class="film-list">
        ${items.join('')}
      </ul>`
  }

  it('returns [] when ul.film-list is absent', () => {
    document.body.innerHTML = '<div>nothing</div>'
    expect(scrapeList(4)).toEqual([])
  })

  it('returns up to count=4 items', () => {
    setListDOM(Array.from({ length: 6 }, (_, i) =>
      makePosterListItem({ name: `Film ${i} (202${i})`, filmId: `${i}` })
    ))
    expect(scrapeList(4)).toHaveLength(4)
  })

  it('returns up to count=10 items', () => {
    setListDOM(Array.from({ length: 12 }, (_, i) =>
      makePosterListItem({ name: `Film ${i} (202${i})`, filmId: `${i}` })
    ))
    expect(scrapeList(10)).toHaveLength(10)
  })

  it('returns up to count=20 items', () => {
    setListDOM(Array.from({ length: 25 }, (_, i) =>
      makePosterListItem({ name: `Film ${i} (202${i})`, filmId: `${i}` })
    ))
    expect(scrapeList(20)).toHaveLength(20)
  })

  it('returns all available when fewer than count exist', () => {
    setListDOM(Array.from({ length: 3 }, (_, i) =>
      makePosterListItem({ name: `Film ${i} (202${i})`, filmId: `${i}` })
    ))
    expect(scrapeList(10)).toHaveLength(3)
  })
})
