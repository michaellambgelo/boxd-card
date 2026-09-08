/**
 * Selector-drift tests, run against REAL Letterboxd HTML.
 *
 * Every other scraper test parses markup a developer wrote by hand, which can
 * only encode what we already believe. That is precisely how the September 2026
 * outage stayed invisible: Letterboxd removed data-poster-url, every card on
 * boxd-card.com failed for ten days, and the whole suite stayed green because
 * every fixture still supplied the attribute.
 *
 * These tests parse `test/fixtures/letterboxd/*.html` — pages captured through
 * the production proxy, the same transport the app uses. When Letterboxd moves a
 * selector again, these go red.
 *
 * Recapture with: node scripts/capture-letterboxd-fixtures.mjs
 */
import { describe, it, expect } from 'vitest'
// Vite's ?raw import, so this stays a plain DOM unit test with no node:fs and
// no separate tsconfig (see the note in tsconfig.json about the visual suite).
import profileHtml from '../../test/fixtures/letterboxd/profile.html?raw'
import filmsHtml from '../../test/fixtures/letterboxd/films.html?raw'
import diaryHtml from '../../test/fixtures/letterboxd/diary.html?raw'
import listHtml from '../../test/fixtures/letterboxd/list.html?raw'
import reviewsListHtml from '../../test/fixtures/letterboxd/reviews-list.html?raw'
import reviewSingleHtml from '../../test/fixtures/letterboxd/review-single.html?raw'
import filmPageHtml from '../../test/fixtures/letterboxd/film-page.html?raw'
import {
  scrapeRecentActivity,
  scrapeFavorites,
  scrapeDiary,
  scrapeList,
  scrapeListMeta,
  scrapeReviewsList,
  scrapeSingleReview,
} from './webScraper'

const FIXTURES: Record<string, string> = {
  'profile': profileHtml,
  'films': filmsHtml,
  'diary': diaryHtml,
  'list': listHtml,
  'reviews-list': reviewsListHtml,
  'review-single': reviewSingleHtml,
  'film-page': filmPageHtml,
}

function fixtureDoc(name: keyof typeof FIXTURES): Document {
  return new DOMParser().parseFromString(FIXTURES[name], 'text/html')
}

/**
 * The contract every poster-grid card type depends on. posterUrl empty for even
 * one film is what the user sees as a grey placeholder; empty for all of them is
 * the outage.
 */
function expectUsableFilms(films: { title: string; posterUrl: string; filmSlug?: string }[], min: number) {
  expect(films.length).toBeGreaterThanOrEqual(min)
  for (const film of films) {
    expect(film.title, 'every film needs a title').toBeTruthy()
    expect(film.posterUrl, `no poster URL for "${film.title}"`).toBeTruthy()
    expect(film.filmSlug, `no film slug for "${film.title}" — TMDB enrichment would silently do nothing`).toBeTruthy()
  }
}

describe('live-markup drift: profile page', () => {
  it('scrapes recent activity with a usable poster for every film', () => {
    expectUsableFilms(scrapeRecentActivity(fixtureDoc('profile')), 4)
  })

  it('scrapes favorites with a usable poster for every film', () => {
    expectUsableFilms(scrapeFavorites(fixtureDoc('profile')), 1)
  })

  it('reconstructs poster URLs, because live HTML no longer ships one', () => {
    // The regression itself: zero data-poster-url attributes in the capture, yet
    // every film still resolves. If this stops holding, the ladder lost a rung.
    expect(profileHtml).not.toContain('data-poster-url')
    for (const film of scrapeRecentActivity(fixtureDoc('profile'))) {
      expect(film.posterUrl).toMatch(/letterboxd\.com\/film\/[^/]+\/image-\d+\/$/)
    }
  })
})

describe('live-markup drift: /films/ fallback page', () => {
  it('falls back to ul.grid li.griditem when #recent-activity is absent', () => {
    expectUsableFilms(scrapeRecentActivity(fixtureDoc('films')), 4)
  })
})

describe('live-markup drift: diary page', () => {
  it('scrapes diary rows with posters and dates', () => {
    const films = scrapeDiary(fixtureDoc('diary'), 20)
    expectUsableFilms(films, 20)
    expect(films.some(f => f.date), 'month/year carry-forward produced no dates').toBe(true)
  })
})

describe('live-markup drift: list page', () => {
  it('scrapes list entries — the container renamed js-list-entries -> poster-list', () => {
    expectUsableFilms(scrapeList(fixtureDoc('list'), 20), 20)
  })

  it('scrapes the list title', () => {
    expect(scrapeListMeta(fixtureDoc('list')).listTitle).toBeTruthy()
  })

  it('does not pick up the related-films strip or the recent-lists sidebar', () => {
    // li.posteritem is used by all three; only real list entries carry
    // data-object-name="list". A profile has 20 sidebar hits, a film page 6.
    expect(scrapeList(fixtureDoc('profile'), 20)).toHaveLength(0)
  })
})

describe('live-markup drift: review pages', () => {
  it('scrapes a reviews list', async () => {
    const films = await scrapeReviewsList(fixtureDoc('reviews-list'), 4)
    expectUsableFilms(films, 1)
  })

  it('scrapes a single review page', async () => {
    const films = await scrapeSingleReview(fixtureDoc('review-single'))
    expectUsableFilms(films, 1)
    // data-film-id is long gone; the id must come from the JSON uid.
    expect(films[0].filmId).toMatch(/^\d+$/)
  })
})

describe('live-markup drift: film page JSON-LD', () => {
  it('still carries the poster URL resolvePosterCdnUrl() reads', () => {
    // This is the ONLY way the web app can turn a slug into a real poster when
    // TMDB has no match. /film/<slug>/json/ and /film/<slug>/image-150/ are both
    // Cloudflare-challenged, so JSON-LD on the film page is the last door open.
    const doc = fixtureDoc('film-page')
    const raw = doc.querySelector('script[type="application/ld+json"]')?.textContent ?? ''
    const json = JSON.parse(
      raw.replace(/^\/\*\s*<!\[CDATA\[[\s\S]*?\*\//m, '').replace(/\/\*\s*\]\]>[\s\S]*?\*\/\s*$/m, '').trim(),
    )
    expect(json.image).toMatch(/^https:\/\/a\.ltrbxd\.com\/resized\/.+\.jpg/)
  })
})
