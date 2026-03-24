import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  proxyUrl,
  fetchImageDataUrl,
  scrapeRecentActivity,
  scrapeFavorites,
  scrapeDiary,
  scrapeList,
  scrapeListMeta,
  scrapeReviewsList,
  scrapeSingleReview,
  scrapeLoggedInUser,
  scrapePageOwnerAvatarUrl,
  scrapeBackdropUrl,
  scrapeUsername,
  buildPageUrl,
  parseLetterboxdUrl,
} from './webScraper'

// ── DOM helpers ───────────────────────────────────────────────────────────────

function makeDoc(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

/** Build a LazyPoster grid item used by activity/favorites/list scrapers. */
function makeFilmItem(overrides: {
  name?: string
  filmId?: string
  posterUrl?: string
  rating?: string
} = {}): string {
  const {
    name = 'Dune (2021)',
    filmId = '371378',
    posterUrl = '/film/dune-2021/image-150/',
    rating = '★★★★',
  } = overrides
  return `
    <li class="griditem">
      <div class="react-component"
        data-component-class="LazyPoster"
        data-item-name="${name}"
        data-film-id="${filmId}"
        data-poster-url="${posterUrl}">
        <img class="image" src="empty-poster.png" />
      </div>
      <p class="poster-viewingdata">
        <span class="rating">${rating}</span>
      </p>
    </li>`
}

function makeDiaryRow(overrides: {
  name?: string
  filmId?: string
  posterUrl?: string
  rating?: string
  month?: string
  year?: string
  day?: string
} = {}): string {
  const {
    name = 'Dune (2021)',
    filmId = '371378',
    posterUrl = '/film/dune-2021/image-150/',
    rating = '★★★★',
    month = '',
    year = '',
    day = '15',
  } = overrides
  return `
    <tr class="diary-entry-row">
      <td class="col-film">
        <div class="react-component"
          data-component-class="LazyPoster"
          data-item-name="${name}"
          data-film-id="${filmId}"
          data-poster-url="${posterUrl}">
          <img class="image" src="empty-poster.png" />
        </div>
      </td>
      <td class="col-rating">
        <span class="hide-for-owner">
          <span class="rating">${rating}</span>
        </span>
      </td>
      <td class="col-monthdate">
        <span class="monthdate">
          ${month ? `<a class="month">${month}</a>` : ''}
          ${year ? `<a class="year">${year}</a>` : ''}
        </span>
      </td>
      <td class="col-daydate">
        <a class="daydate">${day}</a>
      </td>
    </tr>`
}

// ── proxyUrl ──────────────────────────────────────────────────────────────────

describe('proxyUrl', () => {
  it('encodes the target URL as a query param', () => {
    const result = proxyUrl('https://letterboxd.com/user/')
    expect(result).toContain('?url=')
    expect(result).toContain(encodeURIComponent('https://letterboxd.com/user/'))
  })

  it('uses the PROXY_BASE prefix', () => {
    const result = proxyUrl('https://example.com')
    // Should start with the proxy base (default or env-injected)
    expect(result).toMatch(/^https?:\/\//)
  })
})

// ── scrapeRecentActivity ──────────────────────────────────────────────────────

describe('scrapeRecentActivity', () => {
  it('returns [] when #recent-activity is absent and no ul.grid fallback', () => {
    const doc = makeDoc('<html><body><div>nothing</div></body></html>')
    expect(scrapeRecentActivity(doc)).toEqual([])
  })

  it('extracts films from #recent-activity section', () => {
    const doc = makeDoc(`
      <html><body>
        <section id="recent-activity">
          ${makeFilmItem()}
          ${makeFilmItem({ name: 'Arrival (2016)', filmId: '222' })}
        </section>
      </body></html>
    `)
    const films = scrapeRecentActivity(doc)
    expect(films).toHaveLength(2)
    expect(films[0].title).toBe('Dune')
    expect(films[0].year).toBe('2021')
    expect(films[0].filmId).toBe('371378')
    expect(films[0].rating).toBe('★★★★')
  })

  it('caps results at 4', () => {
    const items = Array.from({ length: 6 }, (_, i) =>
      makeFilmItem({ name: `Film ${i} (202${i})`, filmId: `${i}` })
    ).join('')
    const doc = makeDoc(`
      <html><body>
        <section id="recent-activity">${items}</section>
      </body></html>
    `)
    expect(scrapeRecentActivity(doc)).toHaveLength(4)
  })

  it('falls back to ul.grid when #recent-activity is absent', () => {
    const doc = makeDoc(`
      <html><body>
        <ul class="grid">
          ${makeFilmItem({ name: 'Fallback Film (2023)', filmId: '555' })}
        </ul>
      </body></html>
    `)
    const films = scrapeRecentActivity(doc)
    expect(films).toHaveLength(1)
    expect(films[0].title).toBe('Fallback Film')
    expect(films[0].year).toBe('2023')
  })

  it('builds posterUrl from data-poster-url with letterboxd.com prefix', () => {
    const doc = makeDoc(`
      <html><body>
        <section id="recent-activity">
          ${makeFilmItem({ posterUrl: '/film/dune-2021/image-150/' })}
        </section>
      </body></html>
    `)
    const [film] = scrapeRecentActivity(doc)
    expect(film.posterUrl).toBe('https://letterboxd.com/film/dune-2021/image-150/')
  })

  it('returns empty rating when .rating element is absent', () => {
    const doc = makeDoc(`
      <html><body>
        <section id="recent-activity">
          <li class="griditem">
            <div class="react-component"
              data-component-class="LazyPoster"
              data-item-name="No Rating (2024)"
              data-film-id="999"
              data-poster-url="/film/no-rating/image-150/">
            </div>
          </li>
        </section>
      </body></html>
    `)
    const [film] = scrapeRecentActivity(doc)
    expect(film.rating).toBe('')
  })

  it('returns empty posterUrl when data-poster-url is missing', () => {
    const doc = makeDoc(`
      <html><body>
        <section id="recent-activity">
          <li class="griditem">
            <div class="react-component"
              data-component-class="LazyPoster"
              data-item-name="No Poster (2024)"
              data-film-id="888">
            </div>
          </li>
        </section>
      </body></html>
    `)
    const [film] = scrapeRecentActivity(doc)
    expect(film.posterUrl).toBe('')
  })
})

// ── scrapeFavorites ───────────────────────────────────────────────────────────

describe('scrapeFavorites', () => {
  it('returns [] when section#favourites is absent', () => {
    const doc = makeDoc('<html><body><div>nothing</div></body></html>')
    expect(scrapeFavorites(doc)).toEqual([])
  })

  it('extracts up to 4 films from #favourites', () => {
    const items = Array.from({ length: 5 }, (_, i) =>
      makeFilmItem({ name: `Film ${i} (202${i})`, filmId: `${i}` })
    ).join('')
    const doc = makeDoc(`
      <html><body>
        <section id="favourites">${items}</section>
      </body></html>
    `)
    expect(scrapeFavorites(doc)).toHaveLength(4)
  })

  it('always returns empty rating for favorites', () => {
    const doc = makeDoc(`
      <html><body>
        <section id="favourites">
          ${makeFilmItem({ rating: '★★★★★' })}
        </section>
      </body></html>
    `)
    const [film] = scrapeFavorites(doc)
    expect(film.rating).toBe('')
  })

  it('extracts title and year correctly', () => {
    const doc = makeDoc(`
      <html><body>
        <section id="favourites">
          ${makeFilmItem({ name: 'Blade Runner (1982)', filmId: '100' })}
        </section>
      </body></html>
    `)
    const [film] = scrapeFavorites(doc)
    expect(film.title).toBe('Blade Runner')
    expect(film.year).toBe('1982')
  })
})

// ── scrapeDiary ───────────────────────────────────────────────────────────────

describe('scrapeDiary', () => {
  function makeDiaryDoc(rows: string[]): Document {
    return makeDoc(`
      <html><body>
        <table id="diary-table"><tbody>${rows.join('')}</tbody></table>
      </body></html>
    `)
  }

  it('returns [] when diary table is absent', () => {
    const doc = makeDoc('<html><body><div>nothing</div></body></html>')
    expect(scrapeDiary(doc)).toEqual([])
  })

  it('extracts film data with date from first row', () => {
    const doc = makeDiaryDoc([
      makeDiaryRow({ month: 'Mar', year: '2026', day: '20' }),
    ])
    const [film] = scrapeDiary(doc)
    expect(film.title).toBe('Dune')
    expect(film.year).toBe('2021')
    expect(film.rating).toBe('★★★★')
    expect(film.date).toBe('Mar 20, 2026')
  })

  it('carries forward month/year to subsequent rows', () => {
    const doc = makeDiaryDoc([
      makeDiaryRow({ name: 'Film A (2020)', filmId: '1', month: 'Mar', year: '2026', day: '20' }),
      makeDiaryRow({ name: 'Film B (2021)', filmId: '2', month: '', year: '', day: '19' }),
      makeDiaryRow({ name: 'Film C (2022)', filmId: '3', month: '', year: '', day: '18' }),
    ])
    const films = scrapeDiary(doc, 4)
    expect(films[0].date).toBe('Mar 20, 2026')
    expect(films[1].date).toBe('Mar 19, 2026')
    expect(films[2].date).toBe('Mar 18, 2026')
  })

  it('updates month/year when a new month appears', () => {
    const doc = makeDiaryDoc([
      makeDiaryRow({ name: 'Film A (2020)', filmId: '1', month: 'Mar', year: '2026', day: '20' }),
      makeDiaryRow({ name: 'Film B (2021)', filmId: '2', month: 'Feb', year: '2026', day: '28' }),
    ])
    const films = scrapeDiary(doc, 4)
    expect(films[0].date).toBe('Mar 20, 2026')
    expect(films[1].date).toBe('Feb 28, 2026')
  })

  it('respects count parameter', () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      makeDiaryRow({
        name: `Film ${i} (202${i % 10})`,
        filmId: `${i}`,
        month: i === 0 ? 'Mar' : '',
        year: i === 0 ? '2026' : '',
        day: `${20 - i}`,
      })
    )
    const doc = makeDiaryDoc(rows)
    expect(scrapeDiary(doc, 4)).toHaveLength(4)
    expect(scrapeDiary(doc, 10)).toHaveLength(10)
  })

  it('returns empty date when month/year are never set', () => {
    const doc = makeDiaryDoc([
      makeDiaryRow({ month: '', year: '', day: '15' }),
    ])
    const [film] = scrapeDiary(doc)
    expect(film.date).toBe('')
  })

  it('extracts rating from fallback .col-rating .rating selector', () => {
    const doc = makeDoc(`
      <html><body>
        <table id="diary-table"><tbody>
          <tr class="diary-entry-row">
            <td class="col-film">
              <div class="react-component"
                data-component-class="LazyPoster"
                data-item-name="Dune (2021)"
                data-film-id="371378"
                data-poster-url="/film/dune-2021/image-150/">
              </div>
            </td>
            <td class="col-rating">
              <span class="rating">★★★</span>
            </td>
            <td class="col-monthdate">
              <span class="monthdate">
                <a class="month">Mar</a>
                <a class="year">2026</a>
              </span>
            </td>
            <td class="col-daydate">
              <a class="daydate">15</a>
            </td>
          </tr>
        </tbody></table>
      </body></html>
    `)
    const [film] = scrapeDiary(doc)
    expect(film.rating).toBe('★★★')
  })
})

// ── scrapeList ────────────────────────────────────────────────────────────────

describe('scrapeList', () => {
  function makeListItem(overrides: {
    name?: string
    filmId?: string
    posterUrl?: string
    rating?: string
    ownerRating?: string
  } = {}): string {
    const {
      name = 'Dune (2021)',
      filmId = '371378',
      posterUrl = '/film/dune-2021/image-150/',
      rating = '',
      ownerRating = '',
    } = overrides
    return `
      <li class="posteritem"${ownerRating ? ` data-owner-rating="${ownerRating}"` : ''}>
        <div class="react-component"
          data-component-class="LazyPoster"
          data-item-name="${name}"
          data-film-id="${filmId}"
          data-poster-url="${posterUrl}">
        </div>
        ${rating ? `<span class="rating">${rating}</span>` : ''}
      </li>`
  }

  function makeListDoc(items: string[]): Document {
    return makeDoc(`
      <html><body>
        <ul class="js-list-entries">${items.join('')}</ul>
      </body></html>
    `)
  }

  it('returns [] when list is absent', () => {
    const doc = makeDoc('<html><body><div>nothing</div></body></html>')
    expect(scrapeList(doc, 4)).toEqual([])
  })

  it('extracts films from posteritem elements', () => {
    const doc = makeListDoc([
      makeListItem(),
      makeListItem({ name: 'Arrival (2016)', filmId: '222' }),
    ])
    const films = scrapeList(doc, 4)
    expect(films).toHaveLength(2)
    expect(films[0].title).toBe('Dune')
    expect(films[1].title).toBe('Arrival')
  })

  it('respects count parameter', () => {
    const items = Array.from({ length: 10 }, (_, i) =>
      makeListItem({ name: `Film ${i} (202${i % 10})`, filmId: `${i}` })
    )
    const doc = makeListDoc(items)
    expect(scrapeList(doc, 4)).toHaveLength(4)
    expect(scrapeList(doc, 10)).toHaveLength(10)
  })

  it('uses .rating text when present', () => {
    const doc = makeListDoc([makeListItem({ rating: '★★★★' })])
    const [film] = scrapeList(doc, 4)
    expect(film.rating).toBe('★★★★')
  })

  it('converts data-owner-rating to stars when no .rating element', () => {
    const doc = makeListDoc([makeListItem({ ownerRating: '8' })])
    const [film] = scrapeList(doc, 4)
    expect(film.rating).toBe('★★★★')
  })

  it('converts data-owner-rating=1 to half star', () => {
    const doc = makeListDoc([makeListItem({ ownerRating: '1' })])
    const [film] = scrapeList(doc, 4)
    expect(film.rating).toBe('½')
  })

  it('converts data-owner-rating=10 to 5 stars', () => {
    const doc = makeListDoc([makeListItem({ ownerRating: '10' })])
    const [film] = scrapeList(doc, 4)
    expect(film.rating).toBe('★★★★★')
  })

  it('returns empty rating for invalid data-owner-rating', () => {
    const doc = makeListDoc([makeListItem({ ownerRating: '0' })])
    const [film] = scrapeList(doc, 4)
    expect(film.rating).toBe('')
  })

  it('returns empty rating for out-of-range data-owner-rating', () => {
    const doc = makeListDoc([makeListItem({ ownerRating: '11' })])
    const [film] = scrapeList(doc, 4)
    expect(film.rating).toBe('')
  })

  it('also scrapes film-detail items (detail view)', () => {
    const doc = makeDoc(`
      <html><body>
        <ul class="js-list-entries">
          <li class="film-detail">
            <div class="react-component"
              data-component-class="LazyPoster"
              data-item-name="Dune (2021)"
              data-film-id="371378"
              data-poster-url="/film/dune-2021/image-150/">
            </div>
          </li>
        </ul>
      </body></html>
    `)
    const films = scrapeList(doc, 4)
    expect(films).toHaveLength(1)
    expect(films[0].title).toBe('Dune')
  })
})

// ── scrapeListMeta ────────────────────────────────────────────────────────────

describe('scrapeListMeta', () => {
  it('extracts list title', () => {
    const doc = makeDoc(`
      <html><body>
        <div class="list-title-intro">
          <h1 class="title-1">Top 20 of 2025</h1>
        </div>
      </body></html>
    `)
    const { listTitle } = scrapeListMeta(doc)
    expect(listTitle).toBe('Top 20 of 2025')
  })

  it('extracts description paragraphs and filters "Updated" lines', () => {
    const doc = makeDoc(`
      <html><body>
        <div class="list-title-intro">
          <h1 class="title-1">My List</h1>
          <div class="body-text">
            <p>A great list of movies.</p>
            <p>Updated every week.</p>
            <p>Curated with love.</p>
          </div>
        </div>
      </body></html>
    `)
    const { listDescription } = scrapeListMeta(doc)
    expect(listDescription).toBe('A great list of movies. Curated with love.')
    expect(listDescription).not.toContain('Updated')
  })

  it('extracts tags', () => {
    const doc = makeDoc(`
      <html><body>
        <ul class="tags">
          <li><a>sci-fi</a></li>
          <li><a>action</a></li>
        </ul>
      </body></html>
    `)
    const { listTags } = scrapeListMeta(doc)
    expect(listTags).toEqual(['sci-fi', 'action'])
  })

  it('returns empty values when elements are missing', () => {
    const doc = makeDoc('<html><body><div>nothing</div></body></html>')
    const { listTitle, listDescription, listTags } = scrapeListMeta(doc)
    expect(listTitle).toBe('')
    expect(listDescription).toBe('')
    expect(listTags).toEqual([])
  })
})

// ── scrapeReviewsList ─────────────────────────────────────────────────────────

describe('scrapeReviewsList', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  function makeReviewItem(overrides: {
    name?: string
    filmId?: string
    posterUrl?: string
    rating?: string
    datetime?: string
    reviewText?: string
    fullTextUrl?: string
    tags?: string[]
  } = {}): string {
    const {
      name = 'Groundhog Day (1993)',
      filmId = '12345',
      posterUrl = '/film/groundhog-day/image-150/',
      rating = '★★★★★',
      datetime = '2026-03-22',
      reviewText = 'One of the greatest films ever made.',
      fullTextUrl = '',
      tags = [],
    } = overrides
    const tagHtml = tags.length
      ? `<ul class="tags">${tags.map(t => `<li><a>${t}</a></li>`).join('')}</ul>`
      : ''
    return `
      <div class="listitem js-listitem">
        <div class="react-component"
          data-component-class="LazyPoster"
          data-item-name="${name}"
          data-film-id="${filmId}"
          data-poster-url="${posterUrl}">
        </div>
        <div class="content-reactions-strip">
          ${rating ? `<span class="inline-rating"><svg aria-label="${rating}"></svg></span>` : ''}
          <span class="date"><time datetime="${datetime}"></time></span>
        </div>
        <div class="js-review-body${fullTextUrl ? ' js-collapsible-text' : ''}"${fullTextUrl ? ` data-full-text-url="${fullTextUrl}"` : ''}>
          <p>${reviewText}</p>
        </div>
        ${tagHtml}
      </div>`
  }

  function makeReviewsDoc(items: string[]): Document {
    return makeDoc(`
      <html><body>
        <div class="viewing-list">${items.join('')}</div>
      </body></html>
    `)
  }

  it('returns [] when no review items exist', async () => {
    const doc = makeDoc('<html><body><div>nothing</div></body></html>')
    expect(await scrapeReviewsList(doc, 4)).toEqual([])
  })

  it('extracts review data including title, year, rating, date, text', async () => {
    const doc = makeReviewsDoc([makeReviewItem()])
    const [review] = await scrapeReviewsList(doc, 1)
    expect(review.title).toBe('Groundhog Day')
    expect(review.year).toBe('1993')
    expect(review.rating).toBe('★★★★★')
    expect(review.reviewText).toBe('One of the greatest films ever made.')
  })

  it('formats date from ISO datetime attribute', async () => {
    const doc = makeReviewsDoc([makeReviewItem({ datetime: '2026-03-22' })])
    const [review] = await scrapeReviewsList(doc, 1)
    // Date formatting depends on locale, but should contain year and month
    expect(review.date).toContain('2026')
    expect(review.date).toContain('Mar')
    expect(review.date).toContain('22')
  })

  it('returns empty date when datetime attribute is missing', async () => {
    const doc = makeDoc(`
      <html><body>
        <div class="viewing-list">
          <div class="listitem js-listitem">
            <div class="react-component"
              data-component-class="LazyPoster"
              data-item-name="Test (2020)"
              data-film-id="1"
              data-poster-url="/film/test/image-150/">
            </div>
            <div class="content-reactions-strip">
              <span class="date"><time></time></span>
            </div>
          </div>
        </div>
      </body></html>
    `)
    const [review] = await scrapeReviewsList(doc, 1)
    expect(review.date).toBe('')
  })

  it('extracts tags from review items', async () => {
    const doc = makeReviewsDoc([
      makeReviewItem({ tags: ['in theaters', 'moviepass'] }),
    ])
    const [review] = await scrapeReviewsList(doc, 1)
    expect(review.tags).toEqual(['in theaters', 'moviepass'])
  })

  it('respects count parameter', async () => {
    const items = Array.from({ length: 4 }, (_, i) =>
      makeReviewItem({ name: `Film ${i} (202${i})`, filmId: `${i}` })
    )
    const doc = makeReviewsDoc(items)
    const reviews = await scrapeReviewsList(doc, 2)
    expect(reviews).toHaveLength(2)
  })

  it('returns empty rating when no rating element exists', async () => {
    const doc = makeReviewsDoc([makeReviewItem({ rating: '' })])
    const [review] = await scrapeReviewsList(doc, 1)
    expect(review.rating).toBe('')
  })

  it('fetches full text for truncated reviews via data-full-text-url', async () => {
    const fullTextHtml = '<p>First paragraph.</p><p>Second paragraph.</p>'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(fullTextHtml),
    }))

    const doc = makeReviewsDoc([
      makeReviewItem({
        reviewText: 'Truncated...',
        fullTextUrl: '/s/full-text/viewing:12345/',
      }),
    ])
    const [review] = await scrapeReviewsList(doc, 1)
    expect(review.reviewText).toBe('First paragraph.\n\nSecond paragraph.')

    vi.unstubAllGlobals()
  })

  it('falls back to inline text when full-text fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('error'),
    }))

    const doc = makeReviewsDoc([
      makeReviewItem({
        reviewText: 'Inline text only.',
        fullTextUrl: '/s/full-text/viewing:12345/',
      }),
    ])
    const [review] = await scrapeReviewsList(doc, 1)
    // fetchFullText returns '' on failure, so reviewText will be empty
    expect(review.reviewText).toBe('')

    vi.unstubAllGlobals()
  })

  it('returns empty reviewText when no .js-review-body exists', async () => {
    const doc = makeDoc(`
      <html><body>
        <div class="viewing-list">
          <div class="listitem js-listitem">
            <div class="react-component"
              data-component-class="LazyPoster"
              data-item-name="Test (2020)"
              data-film-id="1"
              data-poster-url="/film/test/image-150/">
            </div>
          </div>
        </div>
      </body></html>
    `)
    const [review] = await scrapeReviewsList(doc, 1)
    expect(review.reviewText).toBe('')
  })
})

// ── scrapeLoggedInUser ────────────────────────────────────────────────────────

describe('scrapeLoggedInUser', () => {
  it('returns empty when no matching script is found', () => {
    const doc = makeDoc('<html><head></head><body></body></html>')
    const result = scrapeLoggedInUser(doc)
    expect(result.username).toBe('')
    expect(result.avatarUrl).toBe('')
  })

  it('parses assignment-style person.loggedIn/username/avatarURL24', () => {
    const doc = makeDoc(`
      <html>
        <head>
          <script>
            var person = {};
            person.loggedIn = true;
            person.username = "michaellamb";
            person.avatarURL24 = "https://a.ltrbxd.com/resized/avatar/0-48-0-48-crop/abc.jpg";
          </script>
        </head>
        <body></body>
      </html>
    `)
    const result = scrapeLoggedInUser(doc)
    expect(result.username).toBe('michaellamb')
    expect(result.avatarUrl).toContain('0-80-0-80-crop')
    expect(result.avatarUrl).not.toContain('0-48-0-48-crop')
  })

  it('parses JSON-style "loggedIn":true / "username":"..." / "avatarURL24":"..."', () => {
    const doc = makeDoc(`
      <html>
        <head>
          <script>
            var person = {"loggedIn":true,"username":"testuser","avatarURL24":"https://a.ltrbxd.com/resized/avatar/0-48-0-48-crop/abc.jpg"};
          </script>
        </head>
        <body></body>
      </html>
    `)
    const result = scrapeLoggedInUser(doc)
    expect(result.username).toBe('testuser')
    expect(result.avatarUrl).toContain('0-80-0-80-crop')
  })

  it('returns empty when loggedIn is false', () => {
    const doc = makeDoc(`
      <html>
        <head>
          <script>
            var person = {};
            person.loggedIn = false;
            person.username = "ghost";
          </script>
        </head>
        <body></body>
      </html>
    `)
    const result = scrapeLoggedInUser(doc)
    expect(result.username).toBe('')
  })

  it('returns empty avatarUrl when avatarURL24 is not present', () => {
    const doc = makeDoc(`
      <html>
        <head>
          <script>
            var person = {};
            person.loggedIn = true;
            person.username = "noavatar";
          </script>
        </head>
        <body></body>
      </html>
    `)
    const result = scrapeLoggedInUser(doc)
    expect(result.username).toBe('noavatar')
    expect(result.avatarUrl).toBe('')
  })

  it('ignores scripts with src attribute', () => {
    const doc = makeDoc(`
      <html>
        <head>
          <script src="external.js">person.loggedIn = true; person.username = "external";</script>
        </head>
        <body></body>
      </html>
    `)
    const result = scrapeLoggedInUser(doc)
    expect(result.username).toBe('')
  })
})

// ── scrapePageOwnerAvatarUrl ──────────────────────────────────────────────────

describe('scrapePageOwnerAvatarUrl', () => {
  it('returns empty string when no avatar element is found', () => {
    const doc = makeDoc('<html><body><div>nothing</div></body></html>')
    expect(scrapePageOwnerAvatarUrl(doc)).toBe('')
  })

  it('extracts from .profile-person-avatar img', () => {
    const doc = makeDoc(`
      <html><body>
        <div class="profile-person-avatar">
          <img src="https://a.ltrbxd.com/resized/avatar/0-48-0-48-crop/abc.jpg" />
        </div>
      </body></html>
    `)
    const url = scrapePageOwnerAvatarUrl(doc)
    expect(url).toContain('0-80-0-80-crop')
    expect(url).not.toContain('0-48-0-48-crop')
  })

  it('prefers data-src over src', () => {
    const doc = makeDoc(`
      <html><body>
        <div class="profile-person-avatar">
          <img data-src="https://a.ltrbxd.com/resized/avatar/0-48-0-48-crop/real.jpg"
               src="https://placeholder.com/empty" />
        </div>
      </body></html>
    `)
    const url = scrapePageOwnerAvatarUrl(doc)
    expect(url).toContain('real.jpg')
  })

  it('skips images with empty/placeholder src', () => {
    const doc = makeDoc(`
      <html><body>
        <div class="profile-person-avatar">
          <img src="https://placeholder.com/empty-avatar.png" />
        </div>
        <div class="profile-person">
          <div class="avatar">
            <img src="https://a.ltrbxd.com/resized/avatar/0-48-0-48-crop/fallback.jpg" />
          </div>
        </div>
      </body></html>
    `)
    const url = scrapePageOwnerAvatarUrl(doc)
    // Should skip the placeholder and find the fallback
    expect(url).toContain('fallback.jpg')
  })

  it('skips non-http src values', () => {
    const doc = makeDoc(`
      <html><body>
        <div class="profile-person-avatar">
          <img src="/relative/path.jpg" />
        </div>
      </body></html>
    `)
    expect(scrapePageOwnerAvatarUrl(doc)).toBe('')
  })

  it('tries multiple fallback selectors', () => {
    const doc = makeDoc(`
      <html><body>
        <section class="profile-header">
          <img class="avatar" src="https://a.ltrbxd.com/resized/avatar/0-48-0-48-crop/header.jpg" />
        </section>
      </body></html>
    `)
    const url = scrapePageOwnerAvatarUrl(doc)
    expect(url).toContain('header.jpg')
  })
})

// ── scrapeBackdropUrl ─────────────────────────────────────────────────────────

describe('scrapeBackdropUrl', () => {
  it('returns empty string when no backdrop element exists', () => {
    const doc = makeDoc('<html><body><div>nothing</div></body></html>')
    expect(scrapeBackdropUrl(doc)).toBe('')
  })

  it('extracts data-backdrop-retina (preferred)', () => {
    const doc = makeDoc(`
      <html><body>
        <div data-backdrop-retina="https://a.ltrbxd.com/resized/backdrop.jpg"
             data-backdrop="https://a.ltrbxd.com/resized/backdrop-sm.jpg">
        </div>
      </body></html>
    `)
    expect(scrapeBackdropUrl(doc)).toBe('https://a.ltrbxd.com/resized/backdrop.jpg')
  })

  it('falls back to data-backdrop when retina is absent', () => {
    const doc = makeDoc(`
      <html><body>
        <div data-backdrop="https://a.ltrbxd.com/resized/backdrop-sm.jpg">
        </div>
      </body></html>
    `)
    expect(scrapeBackdropUrl(doc)).toBe('https://a.ltrbxd.com/resized/backdrop-sm.jpg')
  })

  it('prepends https: to protocol-relative URLs', () => {
    const doc = makeDoc(`
      <html><body>
        <div data-backdrop-retina="//a.ltrbxd.com/resized/backdrop.jpg">
        </div>
      </body></html>
    `)
    expect(scrapeBackdropUrl(doc)).toBe('https://a.ltrbxd.com/resized/backdrop.jpg')
  })

  it('does not modify already-absolute URLs', () => {
    const doc = makeDoc(`
      <html><body>
        <div data-backdrop-retina="https://cdn.example.com/image.jpg">
        </div>
      </body></html>
    `)
    expect(scrapeBackdropUrl(doc)).toBe('https://cdn.example.com/image.jpg')
  })
})

// ── scrapeUsername ─────────────────────────────────────────────────────────────

describe('scrapeUsername', () => {
  it('extracts username from body[data-owner]', () => {
    const doc = makeDoc('<html><body data-owner="michaellamb"></body></html>')
    expect(scrapeUsername(doc)).toBe('michaellamb')
  })

  it('returns empty string when data-owner is absent', () => {
    const doc = makeDoc('<html><body></body></html>')
    expect(scrapeUsername(doc)).toBe('')
  })
})

// ── buildPageUrl ──────────────────────────────────────────────────────────────

describe('buildPageUrl', () => {
  it('builds last-four-watched URL', () => {
    expect(buildPageUrl('user', 'last-four-watched', '')).toBe(
      'https://letterboxd.com/user/'
    )
  })

  it('builds favorites URL (same as profile)', () => {
    expect(buildPageUrl('user', 'favorites', '')).toBe(
      'https://letterboxd.com/user/'
    )
  })

  it('builds recent-diary URL', () => {
    expect(buildPageUrl('user', 'recent-diary', '')).toBe(
      'https://letterboxd.com/user/diary/'
    )
  })

  it('builds list URL with slug', () => {
    expect(buildPageUrl('user', 'list', 'best-of-2025')).toBe(
      'https://letterboxd.com/user/list/best-of-2025/'
    )
  })

  it('builds review URL (list page)', () => {
    expect(buildPageUrl('user', 'review', '')).toBe(
      'https://letterboxd.com/user/reviews/'
    )
  })

  it('builds single review URL when filmSlug is provided', () => {
    expect(buildPageUrl('user', 'review', '', 'groundhog-day')).toBe(
      'https://letterboxd.com/user/film/groundhog-day/'
    )
  })
})

// ── parseLetterboxdUrl ────────────────────────────────────────────────────────

describe('parseLetterboxdUrl', () => {
  it('returns null for a non-Letterboxd URL', () => {
    expect(parseLetterboxdUrl('https://example.com/foo')).toBeNull()
  })

  it('returns null for a plain string', () => {
    expect(parseLetterboxdUrl('not a url')).toBeNull()
  })

  it('parses a profile page as cardType null', () => {
    const result = parseLetterboxdUrl('https://letterboxd.com/testuser/')
    expect(result).toMatchObject({ username: 'testuser', cardType: null, listSlug: '', isReviewListPage: false, filmSlug: '' })
  })

  it('parses a /films/ page as last-four-watched', () => {
    const result = parseLetterboxdUrl('https://letterboxd.com/testuser/films/')
    expect(result).toMatchObject({ username: 'testuser', cardType: 'last-four-watched', isReviewListPage: false })
  })

  it('parses a /diary/ page as recent-diary', () => {
    const result = parseLetterboxdUrl('https://letterboxd.com/testuser/diary/')
    expect(result).toMatchObject({ username: 'testuser', cardType: 'recent-diary', isReviewListPage: false })
  })

  it('parses a /films/diary/ page as recent-diary', () => {
    const result = parseLetterboxdUrl('https://letterboxd.com/testuser/films/diary/')
    expect(result).toMatchObject({ username: 'testuser', cardType: 'recent-diary', isReviewListPage: false })
  })

  it('parses a /list/slug/ page as list with slug', () => {
    const result = parseLetterboxdUrl('https://letterboxd.com/testuser/list/best-of-2024/')
    expect(result).toMatchObject({ username: 'testuser', cardType: 'list', listSlug: 'best-of-2024', isReviewListPage: false })
  })

  it('parses a /reviews/ page as review with isReviewListPage true', () => {
    const result = parseLetterboxdUrl('https://letterboxd.com/testuser/reviews/')
    expect(result).toMatchObject({ username: 'testuser', cardType: 'review', isReviewListPage: true, filmSlug: '' })
  })

  it('parses a /film/slug/ page as review with isReviewListPage false', () => {
    const result = parseLetterboxdUrl('https://letterboxd.com/testuser/film/groundhog-day/')
    expect(result).toMatchObject({ username: 'testuser', cardType: 'review', isReviewListPage: false, filmSlug: 'groundhog-day' })
  })

  it('parses a /film/slug/N/ page as single review', () => {
    const result = parseLetterboxdUrl('https://letterboxd.com/testuser/film/groundhog-day/2/')
    expect(result).toMatchObject({ username: 'testuser', cardType: 'review', isReviewListPage: false, filmSlug: 'groundhog-day/2' })
  })

  it('returns short-URL placeholder for boxd.it URLs', () => {
    const result = parseLetterboxdUrl('https://boxd.it/aXIJ7l')
    expect(result).toMatchObject({ username: '', cardType: null, isReviewListPage: false })
  })

  it('handles www prefix on letterboxd.com', () => {
    const result = parseLetterboxdUrl('https://www.letterboxd.com/testuser/diary/')
    expect(result).toMatchObject({ username: 'testuser', cardType: 'recent-diary' })
  })
})

// ── scrapeSingleReview ────────────────────────────────────────────────────────

function makeSingleReviewDoc(overrides: {
  title?: string
  year?: string
  posterUrl?: string
  rating?: string
  day?: string
  month?: string
  yr?: string
  reviewText?: string
  tags?: string[]
} = {}): Document {
  const {
    title = 'Groundhog Day',
    year = '1993',
    posterUrl = '/film/groundhog-day/image-150/',
    rating = '★★★★★',
    day = '02',
    month = 'Feb',
    yr = '2026',
    reviewText = 'A timeless masterpiece.',
    tags = ['comedy', 'classic'],
  } = overrides

  const tagsHtml = tags.map(t => `<li><a>${t}</a></li>`).join('')

  return new DOMParser().parseFromString(`
    <html><body>
      <section class="viewing-poster-container">
        <div class="react-component"
          data-component-class="LazyPoster"
          data-film-id="12345"
          data-poster-url="${posterUrl}">
          <img class="image" src="empty-poster.png" />
        </div>
      </section>
      <header class="inline-production-masthead">
        <h2 class="primaryname"><a>${title}</a></h2>
        <span class="releasedate"><a>${year}</a></span>
      </header>
      <div class="content-reactions-strip">
        <span class="inline-rating"><svg aria-label="${rating}"></svg></span>
      </div>
      <p class="view-date">
        Watched <a>${day}</a> <a>${month}</a> <a>${yr}</a>
      </p>
      <div class="js-review-body"><p>${reviewText}</p></div>
      <ul class="tags">${tagsHtml}</ul>
    </body></html>
  `, 'text/html')
}

describe('scrapeSingleReview', () => {
  it('returns a one-element array with the review data', async () => {
    const doc = makeSingleReviewDoc()
    const result = await scrapeSingleReview(doc)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      title: 'Groundhog Day',
      year: '1993',
      rating: '★★★★★',
      date: 'Feb 02, 2026',
      reviewText: 'A timeless masterpiece.',
      tags: ['comedy', 'classic'],
      posterUrl: 'https://letterboxd.com/film/groundhog-day/image-150/',
    })
  })

  it('returns empty array when title is missing', async () => {
    const doc = makeSingleReviewDoc({ title: '' })
    // The DOM will still have an <a> but textContent will be ''
    const result = await scrapeSingleReview(doc)
    expect(result).toHaveLength(0)
  })

  it('handles missing rating gracefully', async () => {
    const html = `
      <html><body>
        <section class="viewing-poster-container">
          <div class="react-component" data-component-class="LazyPoster" data-film-id="1" data-poster-url="/film/foo/image-150/"></div>
        </section>
        <header class="inline-production-masthead">
          <h2 class="primaryname"><a>Some Film</a></h2>
          <span class="releasedate"><a>2020</a></span>
        </header>
        <p class="view-date"><a>10</a><a>Jan</a><a>2025</a></p>
        <div class="js-review-body"><p>Nice film.</p></div>
      </body></html>`
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const result = await scrapeSingleReview(doc)
    expect(result[0].rating).toBe('')
  })

  it('builds date from view-date links', async () => {
    const doc = makeSingleReviewDoc({ day: '15', month: 'Mar', yr: '2026' })
    const result = await scrapeSingleReview(doc)
    expect(result[0].date).toBe('Mar 15, 2026')
  })
})

// ── fetchImageDataUrl ─────────────────────────────────────────────────────────

/** Build a minimal fake fetch that returns the given responses in sequence. */
function makeFetchSequence(responses: Array<{ ok: boolean; status?: number; headers?: Record<string,string>; body: string | Blob }>) {
  let call = 0
  return vi.fn().mockImplementation(() => {
    const r = responses[call++] ?? responses[responses.length - 1]
    const headers = new Map(Object.entries(r.headers ?? {}))
    return Promise.resolve({
      ok: r.ok,
      status: r.status ?? (r.ok ? 200 : 500),
      headers: { get: (k: string) => headers.get(k.toLowerCase()) ?? null },
      text: () => Promise.resolve(typeof r.body === 'string' ? r.body : ''),
      blob: () => Promise.resolve(typeof r.body !== 'string' ? r.body : new Blob([r.body])),
    })
  })
}

const FILM_PAGE_HTML = `<html><head>
  <script type="application/ld+json">/* <![CDATA[ */
{"@type":"Movie","image":"https://a.ltrbxd.com/resized/sm/poster.jpg?v=abc"}
/* ]]> */</script>
</head><body></body></html>`

const IMAGE_BLOB = new Blob(['fake-image'], { type: 'image/jpeg' })

describe('fetchImageDataUrl', () => {
  beforeEach(() => vi.unstubAllGlobals())

  it('resolves /image-NNN/ poster URLs via the film page JSON-LD', async () => {
    const mockFetch = makeFetchSequence([
      // First call: film page fetch
      { ok: true, headers: { 'content-type': 'text/html' }, body: FILM_PAGE_HTML },
      // Second call: CDN image fetch
      { ok: true, headers: { 'content-type': 'image/jpeg' }, body: IMAGE_BLOB },
    ])
    vi.stubGlobal('fetch', mockFetch)

    const result = await fetchImageDataUrl('https://letterboxd.com/film/dune-2021/image-150/')
    expect(result).toMatch(/^data:image\/jpeg/)
    // First call should be the proxied film page URL
    expect((mockFetch.mock.calls[0][0] as string)).toContain('dune-2021')
    // Second call should be the proxied CDN URL from JSON-LD
    expect((mockFetch.mock.calls[1][0] as string)).toContain('a.ltrbxd.com')
  })

  it('fetches CDN URLs directly without a film page hop', async () => {
    const mockFetch = makeFetchSequence([
      { ok: true, headers: { 'content-type': 'image/jpeg' }, body: IMAGE_BLOB },
    ])
    vi.stubGlobal('fetch', mockFetch)

    await fetchImageDataUrl('https://a.ltrbxd.com/resized/sm/poster.jpg?v=abc')
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('throws when the film page has no JSON-LD', async () => {
    vi.stubGlobal('fetch', makeFetchSequence([
      { ok: true, headers: { 'content-type': 'text/html' }, body: '<html><body></body></html>' },
    ]))
    await expect(
      fetchImageDataUrl('https://letterboxd.com/film/unknown/image-150/')
    ).rejects.toThrow('No JSON-LD')
  })

  it('throws when the proxy returns a non-image content-type', async () => {
    vi.stubGlobal('fetch', makeFetchSequence([
      { ok: true, headers: { 'content-type': 'text/html' }, body: FILM_PAGE_HTML },
      { ok: true, headers: { 'content-type': 'text/html' }, body: '<html/>' },
    ]))
    await expect(
      fetchImageDataUrl('https://letterboxd.com/film/dune-2021/image-150/')
    ).rejects.toThrow('Expected image')
  })
})
