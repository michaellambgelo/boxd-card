import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  scrapeRecentActivity,
  scrapeFavorites,
  scrapeDiary,
  scrapeList,
  scrapeListMeta,
  ownerRatingToStars,
  scrapeReview,
  scrapeReviewsList,
  scrapeBackdropUrl,
  scrapeLoggedInUser,
  scrapeFilmsPage,
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
        <ul class="grid -p150">
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
      makeFilmItem({ name: `Film ${i} (202${i})`, filmId: `${i}` })
    ))
    expect(scrapeFavorites()).toHaveLength(4)
  })

  it('extracts title, year, filmId and returns empty rating', () => {
    setFavoritesDOM([makeFilmItem()])
    const [film] = scrapeFavorites()
    expect(film.title).toBe('Dune')
    expect(film.year).toBe('2021')
    expect(film.filmId).toBe('371378')
    expect(film.rating).toBe('')
  })

  it('uses resolved img.src when not a placeholder', () => {
    setFavoritesDOM([makeFilmItem({ imgSrc: REAL_POSTER })])
    const [film] = scrapeFavorites()
    expect(film.posterUrl).toBe(REAL_POSTER)
  })

  it('falls back to data-poster-url when img.src is a placeholder', () => {
    setFavoritesDOM([
      makeFilmItem({
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
  interface ListItemOverrides {
    name?: string
    filmId?: string
    posterUrl?: string
    imgSrc?: string
    ownerRating?: string | null   // null = omit attribute entirely
  }

  function makeListItem(overrides: ListItemOverrides = {}): string {
    const {
      name = 'Dune (2021)',
      filmId = '371378',
      posterUrl = '/film/dune-2021/image-150/',
      imgSrc = REAL_POSTER,
      ownerRating = '8',
    } = overrides
    const ratingAttr = ownerRating != null ? ` data-owner-rating="${ownerRating}"` : ''
    return `
      <li class="posteritem"${ratingAttr}>
        <div class="react-component" data-component-class="LazyPoster"
          data-item-name="${name}"
          data-film-id="${filmId}"
          data-poster-url="${posterUrl}">
          <img class="image" src="${imgSrc}" />
        </div>
      </li>`
  }

  function makeDetailListItem(overrides: ListItemOverrides & { rating?: string } = {}): string {
    const {
      name = 'Dune (2021)',
      filmId = '371378',
      posterUrl = '/film/dune-2021/image-150/',
      imgSrc = REAL_POSTER,
      rating = '★★★★',
    } = overrides
    return `
      <li class="film-detail">
        <div class="react-component" data-component-class="LazyPoster"
          data-item-name="${name}"
          data-film-id="${filmId}"
          data-poster-url="${posterUrl}">
          <img class="image" src="${imgSrc}" />
        </div>
        <div class="film-detail-content">
          <span class="rating">${rating}</span>
        </div>
      </li>`
  }

  function setListDOM(items: string[]) {
    document.body.innerHTML = `
      <ul class="js-list-entries">
        ${items.join('')}
      </ul>`
  }

  it('returns [] when ul.js-list-entries is absent', () => {
    document.body.innerHTML = '<div>nothing</div>'
    expect(scrapeList(4)).toEqual([])
  })

  it('extracts title, year, filmId from LazyPoster attributes', () => {
    setListDOM([makeListItem()])
    const [film] = scrapeList(1)
    expect(film.title).toBe('Dune')
    expect(film.year).toBe('2021')
    expect(film.filmId).toBe('371378')
    expect(film.rating).toBe('★★★★')  // data-owner-rating="8"
  })

  it('returns empty rating when data-owner-rating is absent', () => {
    setListDOM([makeListItem({ ownerRating: null })])
    const [film] = scrapeList(1)
    expect(film.rating).toBe('')
  })

  it('reads rating from .rating span in detail view (li.film-detail)', () => {
    document.body.innerHTML = `<ul class="js-list-entries">${makeDetailListItem()}</ul>`
    const [film] = scrapeList(1)
    expect(film.title).toBe('Dune')
    expect(film.rating).toBe('★★★★')
  })

  it('prefers .rating span over data-owner-rating when both present', () => {
    document.body.innerHTML = `
      <ul class="js-list-entries">
        <li class="posteritem" data-owner-rating="2">
          <div class="react-component" data-component-class="LazyPoster"
            data-item-name="Dune (2021)" data-film-id="1" data-poster-url="/film/dune/image-150/">
            <img class="image" src="${REAL_POSTER}" />
          </div>
          <span class="rating">★★★★★</span>
        </li>
      </ul>`
    const [film] = scrapeList(1)
    expect(film.rating).toBe('★★★★★')
  })

  it('returns mixed grid and detail items from the same list', () => {
    document.body.innerHTML = `
      <ul class="js-list-entries">
        ${makeListItem({ name: 'Film A (2021)', filmId: '1' })}
        ${makeDetailListItem({ name: 'Film B (2022)', filmId: '2', rating: '★★★' })}
      </ul>`
    const films = scrapeList(4)
    expect(films).toHaveLength(2)
    expect(films[0].rating).toBe('★★★★')
    expect(films[1].rating).toBe('★★★')
  })

  it('uses resolved img.src when not a placeholder', () => {
    setListDOM([makeListItem({ imgSrc: REAL_POSTER })])
    const [film] = scrapeList(1)
    expect(film.posterUrl).toBe(REAL_POSTER)
  })

  it('falls back to data-poster-url when img.src is a placeholder', () => {
    setListDOM([makeListItem({ imgSrc: `https://s.ltrbxd.com/static/img/empty-poster-125-abc.png` })])
    const [film] = scrapeList(1)
    expect(film.posterUrl).toBe('https://letterboxd.com/film/dune-2021/image-150/')
  })

  it('returns up to count=4 items', () => {
    setListDOM(Array.from({ length: 6 }, (_, i) =>
      makeListItem({ name: `Film ${i} (202${i})`, filmId: `${i}` })
    ))
    expect(scrapeList(4)).toHaveLength(4)
  })

  it('returns up to count=10 items', () => {
    setListDOM(Array.from({ length: 12 }, (_, i) =>
      makeListItem({ name: `Film ${i} (202${i})`, filmId: `${i}` })
    ))
    expect(scrapeList(10)).toHaveLength(10)
  })

  it('returns up to count=20 items', () => {
    setListDOM(Array.from({ length: 25 }, (_, i) =>
      makeListItem({ name: `Film ${i} (202${i})`, filmId: `${i}` })
    ))
    expect(scrapeList(20)).toHaveLength(20)
  })

  it('returns all available when fewer than count exist', () => {
    setListDOM(Array.from({ length: 3 }, (_, i) =>
      makeListItem({ name: `Film ${i} (202${i})`, filmId: `${i}` })
    ))
    expect(scrapeList(10)).toHaveLength(3)
  })
})

// ── scrapeFilmsPage ───────────────────────────────────────────────────────────

describe('scrapeFilmsPage', () => {
  function makeFilmsPageItem(overrides: FilmOverrides = {}): string {
    const {
      name = 'Dune (2021)',
      filmId = '371378',
      posterUrl = '/film/dune-2021/image-150/',
      imgSrc = REAL_POSTER,
      rating = '★★★★',
    } = overrides
    return `
      <li class="poster-container">
        <div class="react-component"
          data-component-class="LazyPoster"
          data-item-name="${name}"
          data-film-id="${filmId}"
          data-poster-url="${posterUrl}">
          <img class="image" src="${imgSrc}" />
        </div>
        <p class="poster-viewingdata">
          <span class="rating">${rating}</span>
        </p>
      </li>`
  }

  function setFilmsPageDOM(items: string[]) {
    document.body.innerHTML = `
      <ul class="poster-list">
        ${items.join('')}
      </ul>`
  }

  it('returns [] when ul.poster-list is absent', () => {
    document.body.innerHTML = '<div>nothing</div>'
    expect(scrapeFilmsPage()).toEqual([])
  })

  it('extracts title, year, rating, and filmId', () => {
    setFilmsPageDOM([makeFilmsPageItem()])
    const [film] = scrapeFilmsPage()
    expect(film.title).toBe('Dune')
    expect(film.year).toBe('2021')
    expect(film.rating).toBe('★★★★')
    expect(film.filmId).toBe('371378')
  })

  it('uses resolved img.src as posterUrl when not a placeholder', () => {
    setFilmsPageDOM([makeFilmsPageItem({ imgSrc: REAL_POSTER })])
    const [film] = scrapeFilmsPage()
    expect(film.posterUrl).toBe(REAL_POSTER)
  })

  it('falls back to data-poster-url when img.src contains the placeholder', () => {
    setFilmsPageDOM([
      makeFilmsPageItem({
        imgSrc: `https://s.ltrbxd.com/static/img/${PLACEHOLDER}`,
        posterUrl: '/film/dune-2021/image-150/',
      }),
    ])
    const [film] = scrapeFilmsPage()
    expect(film.posterUrl).toBe('https://letterboxd.com/film/dune-2021/image-150/')
  })

  it('caps results at 4', () => {
    setFilmsPageDOM(Array.from({ length: 6 }, (_, i) =>
      makeFilmsPageItem({ name: `Film ${i} (202${i})`, filmId: `${i}` })
    ))
    expect(scrapeFilmsPage()).toHaveLength(4)
  })

  it('returns empty string for rating when rating element is absent', () => {
    document.body.innerHTML = `
      <ul class="poster-list">
        <li class="poster-container">
          <div class="react-component" data-component-class="LazyPoster"
            data-item-name="No Rating (2024)" data-film-id="1"
            data-poster-url="/film/x/">
            <img class="image" src="${REAL_POSTER}" />
          </div>
        </li>
      </ul>`
    const [film] = scrapeFilmsPage()
    expect(film.rating).toBe('')
  })
})

// ── scrapeListMeta ────────────────────────────────────────────────────────────

describe('scrapeListMeta', () => {
  function setListMetaDOM(title: string, paragraphs: string[]) {
    document.body.innerHTML = `
      <div class="list-title-intro">
        <h1 class="title-1">${title}</h1>
        <div class="body-text">
          ${paragraphs.map(p => `<p>${p}</p>`).join('')}
        </div>
      </div>`
  }

  it('returns empty strings when .list-title-intro is absent', () => {
    document.body.innerHTML = '<div>nothing</div>'
    expect(scrapeListMeta()).toEqual({ listTitle: '', listDescription: '', listTags: [] })
  })

  it('extracts listTitle from h1.title-1', () => {
    setListMetaDOM('My 2025 Releases Ranked', [])
    expect(scrapeListMeta().listTitle).toBe('My 2025 Releases Ranked')
  })

  it('extracts description from .body-text p', () => {
    setListMetaDOM('Test List', ['A fantastic year for musical horror movies'])
    expect(scrapeListMeta().listDescription).toBe('A fantastic year for musical horror movies')
  })

  it('filters out Letterboxd-appended "Updated ..." paragraph', () => {
    setListMetaDOM('Test List', [
      'A fantastic year for musical horror movies',
      'Updated 20 Mar',
    ])
    expect(scrapeListMeta().listDescription).toBe('A fantastic year for musical horror movies')
  })

  it('joins multiple description paragraphs with a space', () => {
    setListMetaDOM('Test List', ['First paragraph.', 'Second paragraph.', 'Updated 1 Jan'])
    expect(scrapeListMeta().listDescription).toBe('First paragraph. Second paragraph.')
  })

  it('returns empty listDescription when all paragraphs are filtered', () => {
    setListMetaDOM('Test List', ['Updated 20 Mar'])
    expect(scrapeListMeta().listDescription).toBe('')
  })

  it('extracts listTags from ul.tags li a', () => {
    document.body.innerHTML = `
      <div class="list-title-intro">
        <h1 class="title-1">My List</h1>
        <div class="body-text"></div>
      </div>
      <ul class="tags">
        <li><a href="#">in theaters</a></li>
        <li><a href="#">moviepass</a></li>
      </ul>`
    expect(scrapeListMeta().listTags).toEqual(['in theaters', 'moviepass'])
  })

  it('returns empty listTags when ul.tags is absent', () => {
    setListMetaDOM('My List', [])
    expect(scrapeListMeta().listTags).toEqual([])
  })
})

// ── ownerRatingToStars ────────────────────────────────────────────────────────

describe('ownerRatingToStars', () => {
  it('returns empty string for null', () => {
    expect(ownerRatingToStars(null)).toBe('')
  })

  it('returns empty string for out-of-range values', () => {
    expect(ownerRatingToStars('0')).toBe('')
    expect(ownerRatingToStars('11')).toBe('')
    expect(ownerRatingToStars('abc')).toBe('')
  })

  it('maps 1→½ and 2→★', () => {
    expect(ownerRatingToStars('1')).toBe('½')
    expect(ownerRatingToStars('2')).toBe('★')
  })

  it('maps 8→★★★★', () => {
    expect(ownerRatingToStars('8')).toBe('★★★★')
  })

  it('maps 10→★★★★★', () => {
    expect(ownerRatingToStars('10')).toBe('★★★★★')
  })
})

// ── scrapeReview ──────────────────────────────────────────────────────────────

describe('scrapeReview', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  function setSingleReviewDOM(opts: {
    posterUrl?: string
    imgSrc?: string
    title?: string
    year?: string
    rating?: string
    day?: string
    month?: string
    yr?: string
    reviewText?: string
  } = {}) {
    const {
      posterUrl = '/film/groundhog-day/image-150/',
      imgSrc = REAL_POSTER,
      title = 'Groundhog Day',
      year = '1993',
      rating = '★★★★★',
      day = '02',
      month = 'Feb',
      yr = '2026',
      reviewText = 'What a masterpiece.',
    } = opts
    document.body.innerHTML = `
      <section class="viewing-poster-container">
        <div class="react-component" data-component-class="LazyPoster"
          data-film-id="7418" data-poster-url="${posterUrl}">
          <img class="image" src="${imgSrc}" />
        </div>
      </section>
      <header class="inline-production-masthead">
        <h2 class="primaryname"><a>${title}</a></h2>
        <span class="releasedate"><a>${year}</a></span>
      </header>
      <div class="content-reactions-strip">
        <span class="inline-rating">
          <svg aria-label="${rating}"></svg>
        </span>
      </div>
      <p class="view-date">
        <a>${day}</a><a>${month}</a><a>${yr}</a>
      </p>
      <div class="js-review-body"><p>${reviewText}</p></div>`
  }

  it('returns [] when section.viewing-poster-container is absent', async () => {
    document.body.innerHTML = '<div>nothing</div>'
    expect(await scrapeReview()).toEqual([])
  })

  it('returns an entry with empty reviewText when .js-review-body is absent', async () => {
    document.body.innerHTML = `
      <section class="viewing-poster-container">
        <div class="react-component" data-component-class="LazyPoster"
             data-film-id="42" data-poster-url="/film/x/">
          <img class="image" src="${REAL_POSTER}" />
        </div>
      </section>`
    const result = await scrapeReview()
    expect(result).toHaveLength(1)
    expect(result[0].reviewText).toBe('')
  })

  it('extracts title, year, rating, date, and review text', async () => {
    setSingleReviewDOM()
    const [entry] = await scrapeReview()
    expect(entry.title).toBe('Groundhog Day')
    expect(entry.year).toBe('1993')
    expect(entry.rating).toBe('★★★★★')
    expect(entry.date).toBe('Feb 02, 2026')
    expect(entry.reviewText).toBe('What a masterpiece.')
  })

  it('uses resolved img.src as posterUrl when not a placeholder', async () => {
    setSingleReviewDOM({ imgSrc: REAL_POSTER })
    const [entry] = await scrapeReview()
    expect(entry.posterUrl).toBe(REAL_POSTER)
  })

  it('falls back to data-poster-url when img.src is a placeholder', async () => {
    setSingleReviewDOM({
      imgSrc: `https://s.ltrbxd.com/static/img/${PLACEHOLDER}`,
      posterUrl: '/film/groundhog-day/image-150/',
    })
    const [entry] = await scrapeReview()
    expect(entry.posterUrl).toBe('https://letterboxd.com/film/groundhog-day/image-150/')
  })

  it('joins multiple review paragraphs with \\n\\n', async () => {
    document.body.innerHTML = `
      <section class="viewing-poster-container">
        <div class="react-component" data-component-class="LazyPoster" data-poster-url="/film/x/">
          <img class="image" src="${REAL_POSTER}" />
        </div>
      </section>
      <header class="inline-production-masthead">
        <h2 class="primaryname"><a>Film</a></h2>
        <span class="releasedate"><a>2020</a></span>
      </header>
      <div class="content-reactions-strip"></div>
      <p class="view-date"><a>01</a><a>Jan</a><a>2020</a></p>
      <div class="js-review-body"><p>First paragraph.</p><p>Second paragraph.</p></div>`
    const [entry] = await scrapeReview()
    expect(entry.reviewText).toBe('First paragraph.\n\nSecond paragraph.')
  })

  it('extracts tags from ul.tags li a', async () => {
    setSingleReviewDOM()
    // Inject tags into the page DOM
    document.body.innerHTML += `
      <ul class="tags">
        <li><a href="#">in theaters</a></li>
        <li><a href="#">moviepass</a></li>
      </ul>`
    const [entry] = await scrapeReview()
    expect(entry.tags).toEqual(['in theaters', 'moviepass'])
  })

  it('returns empty tags array when ul.tags is absent', async () => {
    setSingleReviewDOM()
    const [entry] = await scrapeReview()
    expect(entry.tags).toEqual([])
  })

  it('returns empty rating when rating element is absent', async () => {
    document.body.innerHTML = `
      <section class="viewing-poster-container">
        <div class="react-component" data-component-class="LazyPoster" data-poster-url="/film/x/">
          <img class="image" src="${REAL_POSTER}" />
        </div>
      </section>
      <header class="inline-production-masthead">
        <h2 class="primaryname"><a>Film</a></h2>
        <span class="releasedate"><a>2020</a></span>
      </header>
      <div class="content-reactions-strip"></div>
      <p class="view-date"><a>01</a><a>Jan</a><a>2020</a></p>
      <div class="js-review-body"><p>Some text.</p></div>`
    const [entry] = await scrapeReview()
    expect(entry.rating).toBe('')
  })
})

// ── scrapeReviewsList ─────────────────────────────────────────────────────────

describe('scrapeReviewsList', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  function makeReviewListItem(opts: {
    title?: string
    year?: string
    posterUrl?: string
    imgSrc?: string
    rating?: string
    datetime?: string
    reviewText?: string
    fullTextUrl?: string
  } = {}): string {
    const {
      title = 'Groundhog Day',
      year = '1993',
      posterUrl = '/film/groundhog-day/image-150/',
      imgSrc = REAL_POSTER,
      rating = '★★★★★',
      datetime = '2026-03-22',
      reviewText = 'A classic.',
      fullTextUrl = '',
    } = opts
    const fullTextAttr = fullTextUrl ? ` data-full-text-url="${fullTextUrl}"` : ''
    return `
      <div class="listitem js-listitem">
        <article class="production-viewing viewing-poster-container js-production-viewing">
          <div class="react-component" data-component-class="LazyPoster"
            data-film-id="7418" data-poster-url="${posterUrl}">
            <img class="image" src="${imgSrc}" />
          </div>
          <header class="inline-production-masthead">
            <h2 class="primaryname"><a>${title}</a></h2>
            <span class="releasedate"><a>${year}</a></span>
          </header>
          <div class="content-reactions-strip">
            <span class="inline-rating"><svg aria-label="${rating}"></svg></span>
            <span class="date"><time datetime="${datetime}"></time></span>
          </div>
          <div class="js-review-body"${fullTextAttr}><p>${reviewText}</p></div>
        </article>
      </div>`
  }

  function setReviewsListDOM(items: string[]) {
    document.body.innerHTML = `<div class="viewing-list">${items.join('')}</div>`
  }

  it('returns [] when div.viewing-list is absent', async () => {
    document.body.innerHTML = '<div>nothing</div>'
    expect(await scrapeReviewsList(4)).toEqual([])
  })

  it('extracts title, year, rating, date, and review text', async () => {
    setReviewsListDOM([makeReviewListItem()])
    const [entry] = await scrapeReviewsList(1)
    expect(entry.title).toBe('Groundhog Day')
    expect(entry.year).toBe('1993')
    expect(entry.rating).toBe('★★★★★')
    expect(entry.date).toMatch(/Mar/)
    expect(entry.reviewText).toBe('A classic.')
  })

  it('caps results at the given count', async () => {
    setReviewsListDOM(Array.from({ length: 5 }, () => makeReviewListItem()))
    expect(await scrapeReviewsList(2)).toHaveLength(2)
  })

  it('fetches full text when data-full-text-url is present', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '<p>Full review text.</p>',
    }))
    setReviewsListDOM([makeReviewListItem({ fullTextUrl: '/s/full-text/viewing:123/' })])
    const [entry] = await scrapeReviewsList(1)
    expect(entry.reviewText).toBe('Full review text.')
    expect(fetch).toHaveBeenCalledWith('https://letterboxd.com/s/full-text/viewing:123/')
  })

  it('falls back to DOM text when full-text fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')))
    setReviewsListDOM([makeReviewListItem({ fullTextUrl: '/s/full-text/viewing:999/' })])
    const [entry] = await scrapeReviewsList(1)
    expect(entry.reviewText).toBe('')
  })

  it('uses DOM text when data-full-text-url is absent', async () => {
    setReviewsListDOM([makeReviewListItem({ reviewText: 'Short review.' })])
    const [entry] = await scrapeReviewsList(1)
    expect(entry.reviewText).toBe('Short review.')
  })

  it('extracts per-review tags from ul.tags li a', async () => {
    document.body.innerHTML = `
      <div class="viewing-list">
        <div class="listitem js-listitem">
          <article class="production-viewing viewing-poster-container js-production-viewing">
            <div class="react-component" data-component-class="LazyPoster"
              data-film-id="1" data-poster-url="/film/x/">
              <img class="image" src="${REAL_POSTER}" />
            </div>
            <header class="inline-production-masthead">
              <h2 class="primaryname"><a>Film</a></h2>
              <span class="releasedate"><a>2020</a></span>
            </header>
            <div class="content-reactions-strip">
              <span class="date"><time datetime="2026-01-01"></time></span>
            </div>
            <div class="js-review-body"><p>Great.</p></div>
            <ul class="tags">
              <li><a href="#">sci-fi</a></li>
              <li><a href="#">favorites</a></li>
            </ul>
          </article>
        </div>
      </div>`
    const [entry] = await scrapeReviewsList(1)
    expect(entry.tags).toEqual(['sci-fi', 'favorites'])
  })
})

describe('scrapeLoggedInUser', () => {
  afterEach(() => {
    // @ts-ignore
    delete window.person
    document.head.innerHTML = ''
  })

  it('returns empty strings when not logged in', () => {
    expect(scrapeLoggedInUser()).toEqual({ username: '', avatarUrl: '' })
  })

  it('extracts username from global person object (Pass 1)', () => {
    // @ts-ignore
    window.person = { loggedIn: true, username: 'michaellamb', avatarURL24: '' }
    expect(scrapeLoggedInUser().username).toBe('michaellamb')
  })

  it('extracts and upsizes avatarUrl from global person object (Pass 1)', () => {
    // @ts-ignore
    window.person = {
      loggedIn: true,
      username: 'michaellamb',
      avatarURL24: 'https://a.ltrbxd.com/resized/avatar/upload/1/4/3/6/9/2/4/shard/avtr-0-48-0-48-crop.jpg?v=52b738d4e8',
    }
    expect(scrapeLoggedInUser().avatarUrl).toBe(
      'https://a.ltrbxd.com/resized/avatar/upload/1/4/3/6/9/2/4/shard/avtr-0-80-0-80-crop.jpg?v=52b738d4e8'
    )
  })

  it('returns empty strings when person.loggedIn is false (Pass 1)', () => {
    // @ts-ignore
    window.person = {
      loggedIn: false,
      username: 'michaellamb',
      avatarURL24: 'https://a.ltrbxd.com/resized/avatar/upload/1/4/3/6/9/2/4/shard/avtr-0-48-0-48-crop.jpg',
    }
    expect(scrapeLoggedInUser()).toEqual({ username: '', avatarUrl: '' })
  })

  it('extracts username from inline script assignment syntax (Pass 2)', () => {
    // type="text/plain" prevents JSDOM from executing the script; the selector still finds it
    const s = document.createElement('script')
    s.type = 'text/plain'
    s.textContent = `person.username = "michaellamb"; person.loggedIn = true; person.avatarURL24 = "";`
    document.head.appendChild(s)
    expect(scrapeLoggedInUser().username).toBe('michaellamb')
  })

  it('extracts and upsizes avatarUrl from inline script assignment syntax (Pass 2)', () => {
    const s = document.createElement('script')
    s.type = 'text/plain'
    s.textContent = `person.username = "michaellamb"; person.loggedIn = true; person.avatarURL24 = "https://a.ltrbxd.com/resized/avatar/upload/1/4/3/6/9/2/4/shard/avtr-0-48-0-48-crop.jpg?v=52b738d4e8";`
    document.head.appendChild(s)
    expect(scrapeLoggedInUser().avatarUrl).toBe(
      'https://a.ltrbxd.com/resized/avatar/upload/1/4/3/6/9/2/4/shard/avtr-0-80-0-80-crop.jpg?v=52b738d4e8'
    )
  })

  it('returns empty strings when loggedIn is false in inline script (Pass 2)', () => {
    const s = document.createElement('script')
    s.type = 'text/plain'
    s.textContent = `person.username = "michaellamb"; person.loggedIn = false;`
    document.head.appendChild(s)
    expect(scrapeLoggedInUser()).toEqual({ username: '', avatarUrl: '' })
  })
})

describe('scrapeBackdropUrl', () => {
  afterEach(() => { document.body.innerHTML = '' })

  it('returns empty string when no backdrop element exists', () => {
    document.body.innerHTML = '<div class="other"></div>'
    expect(scrapeBackdropUrl()).toBe('')
  })

  it('prefers data-backdrop-retina over data-backdrop', () => {
    document.body.innerHTML = `
      <div class="backdrop"
           data-backdrop="//a.ltrbxd.com/backdrop.jpg"
           data-backdrop-retina="//a.ltrbxd.com/backdrop@2x.jpg"></div>`
    expect(scrapeBackdropUrl()).toBe('https://a.ltrbxd.com/backdrop@2x.jpg')
  })

  it('falls back to data-backdrop when retina is absent', () => {
    document.body.innerHTML = `
      <div class="backdrop" data-backdrop="//a.ltrbxd.com/backdrop.jpg"></div>`
    expect(scrapeBackdropUrl()).toBe('https://a.ltrbxd.com/backdrop.jpg')
  })

  it('returns absolute HTTPS URL unchanged', () => {
    document.body.innerHTML = `
      <div data-backdrop="https://a.ltrbxd.com/backdrop.jpg"></div>`
    expect(scrapeBackdropUrl()).toBe('https://a.ltrbxd.com/backdrop.jpg')
  })

  it('returns empty string when attribute value is empty', () => {
    document.body.innerHTML = '<div data-backdrop=""></div>'
    expect(scrapeBackdropUrl()).toBe('')
  })
})
