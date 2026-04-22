import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the TMDB client before importing scrapeLetterboxdPage so the scraper
// picks up the mocked version. slugFromPosterUrl is re-exported here too so
// the scraper's import resolves cleanly.
vi.mock('./tmdbClient', () => ({
  fetchTmdbData: vi.fn().mockResolvedValue(null),
  slugFromPosterUrl: vi.fn((url: string) => {
    const m = url.match(/letterboxd\.com\/film\/([^/]+)\//)
    return m?.[1] ?? ''
  }),
}))

import { scrapeLetterboxdPage } from './webScraper'
import { fetchTmdbData } from './tmdbClient'

const fetchTmdbSpy = vi.mocked(fetchTmdbData)

const PROFILE_HTML = `<!DOCTYPE html>
<html>
  <body data-owner="tester">
    <section id="recent-activity">
      <ul>
        <li class="griditem">
          <div class="react-component" data-component-class="LazyPoster"
               data-item-name="Dune (2021)" data-film-id="371378"
               data-poster-url="/film/dune-2021/image-150/"></div>
          <img class="image" />
          <p class="poster-viewingdata"><span class="rating">★★★★</span></p>
        </li>
      </ul>
    </section>
  </body>
</html>`

describe('scrapeLetterboxdPage — TMDB enrichment toggle', () => {
  beforeEach(() => {
    fetchTmdbSpy.mockClear()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(PROFILE_HTML, { status: 200, headers: { 'Content-Type': 'text/html' } }),
    ))
  })

  it('calls fetchTmdbData when enrichWithTmdb defaults to true', async () => {
    await scrapeLetterboxdPage('tester', 'last-four-watched', '', 4, 1, true, '', undefined, undefined)
    expect(fetchTmdbSpy).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
  })

  it('skips fetchTmdbData when enrichWithTmdb is false', async () => {
    const result = await scrapeLetterboxdPage('tester', 'last-four-watched', '', 4, 1, true, '', undefined, undefined, false)
    expect(fetchTmdbSpy).not.toHaveBeenCalled()
    // Films come back without any TMDB-derived fields populated.
    expect(result.films).toHaveLength(1)
    expect(result.films[0].tmdbPosterUrl).toBeUndefined()
    expect(result.films[0].tmdbBackdropUrl).toBeUndefined()
    expect(result.films[0].director).toBeUndefined()
    vi.unstubAllGlobals()
  })
})
