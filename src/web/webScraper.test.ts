import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  proxyUrl,
  scrapeRecentActivity,
  scrapeFavorites,
  scrapeDiary,
  scrapeList,
  scrapeListMeta,
  scrapeReviewsList,
  scrapeLoggedInUser,
  scrapePageOwnerAvatarUrl,
  scrapeBackdropUrl,
  scrapeUsername,
  buildPageUrl,
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

  it('builds review URL', () => {
    expect(buildPageUrl('user', 'review', '')).toBe(
      'https://letterboxd.com/user/reviews/'
    )
  })
})
