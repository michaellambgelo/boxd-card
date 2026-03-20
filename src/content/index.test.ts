import { describe, it, expect, beforeEach } from 'vitest'
import { scrapeFilms } from './index'

const PLACEHOLDER = 'empty-poster-150-DtnLDE3k.png'
const REAL_POSTER = 'https://a.ltrbxd.com/resized/film-poster/dune-0-150-0-225-crop.jpg'

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

function setDOM(items: string[]) {
  document.body.innerHTML = `
    <section id="recent-activity">
      <ul class="grid -p150">
        ${items.join('')}
      </ul>
    </section>`
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('scrapeFilms', () => {
  it('returns [] when #recent-activity is absent', () => {
    document.body.innerHTML = '<div>nothing here</div>'
    expect(scrapeFilms()).toEqual([])
  })

  it('returns [] when section has no li.griditem children', () => {
    document.body.innerHTML = '<section id="recent-activity"><ul class="grid -p150"></ul></section>'
    expect(scrapeFilms()).toEqual([])
  })

  it('extracts title (without year), year, rating, and filmId', () => {
    setDOM([makeFilmItem()])
    const [film] = scrapeFilms()
    expect(film.title).toBe('Dune')
    expect(film.year).toBe('2021')
    expect(film.rating).toBe('★★★★')
    expect(film.filmId).toBe('371378')
  })

  it('uses resolved img.src as posterUrl when it is not the placeholder', () => {
    setDOM([makeFilmItem({ imgSrc: REAL_POSTER })])
    const [film] = scrapeFilms()
    expect(film.posterUrl).toBe(REAL_POSTER)
  })

  it('falls back to data-poster-url when img.src contains the placeholder', () => {
    setDOM([
      makeFilmItem({
        imgSrc: `https://s.ltrbxd.com/static/img/${PLACEHOLDER}`,
        posterUrl: '/film/dune-2021/image-150/',
      }),
    ])
    const [film] = scrapeFilms()
    expect(film.posterUrl).toBe('https://letterboxd.com/film/dune-2021/image-150/')
  })

  it('caps results at 4 even when more items exist', () => {
    setDOM(Array.from({ length: 6 }, (_, i) =>
      makeFilmItem({ name: `Film ${i} (202${i})`, filmId: `${i}` })
    ))
    expect(scrapeFilms()).toHaveLength(4)
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
    const [film] = scrapeFilms()
    expect(film.rating).toBe('')
  })
})
