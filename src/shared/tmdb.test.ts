import { describe, it, expect } from 'vitest'
import { slugFromPosterUrl, mergeTmdb, didUseTmdb, type TmdbFilmData } from './tmdb'
import type { FilmData } from '../content/index'

describe('slugFromPosterUrl', () => {
  it('extracts slug from a full letterboxd.com/film/<slug>/image-NNN/ URL', () => {
    expect(slugFromPosterUrl('https://letterboxd.com/film/dune-2021/image-150/'))
      .toBe('dune-2021')
  })

  it('extracts slug from a bare /film/<slug>/ URL', () => {
    expect(slugFromPosterUrl('https://letterboxd.com/film/groundhog-day/'))
      .toBe('groundhog-day')
  })

  // Extension scrape time: content script reads `data-poster-url` directly.
  it('extracts slug from a raw data-poster-url path (no host)', () => {
    expect(slugFromPosterUrl('/film/dune-2021/image-150/')).toBe('dune-2021')
  })

  // Extension after LazyPoster has resolved: img.src is the CDN URL.
  // These contain /film-poster/, not /film/, so extraction correctly yields ''.
  // The caller should fall back to the scrape-time `filmSlug`.
  it('returns empty for a resolved a.ltrbxd.com CDN URL', () => {
    expect(slugFromPosterUrl(
      'https://a.ltrbxd.com/resized/film-poster/9/9/1/9/7/5/991975-dune-0-1000-0-1500-crop.jpg',
    )).toBe('')
  })

  it('returns empty string when URL does not match', () => {
    expect(slugFromPosterUrl('https://letterboxd.com/user/dune/')).toBe('')
    expect(slugFromPosterUrl('')).toBe('')
    expect(slugFromPosterUrl('not-a-url')).toBe('')
  })
})

describe('mergeTmdb', () => {
  const baseFilm: FilmData = {
    title: 'Dune',
    year: '2021',
    rating: '★★★★',
    posterUrl: 'https://letterboxd.com/film/dune-2021/image-150/',
    filmId: '371378',
  }

  const fullTmdb: TmdbFilmData = {
    tmdbId: 438631,
    type: 'movie',
    title: 'Dune',
    releaseDate: '2021-09-15',
    runtime: 155,
    overview: 'Paul Atreides...',
    director: 'Denis Villeneuve',
    genres: ['Science Fiction'],
    posterUrl: 'https://image.tmdb.org/t/p/original/p.jpg',
    backdropUrl: 'https://image.tmdb.org/t/p/original/b.jpg',
  }

  it('copies all TMDB fields onto the film', () => {
    const merged = mergeTmdb(baseFilm, fullTmdb)
    expect(merged.tmdbPosterUrl).toBe(fullTmdb.posterUrl)
    expect(merged.tmdbBackdropUrl).toBe(fullTmdb.backdropUrl)
    expect(merged.director).toBe('Denis Villeneuve')
    expect(merged.runtime).toBe(155)
    expect(merged.genres).toEqual(['Science Fiction'])
    expect(merged.overview).toBe('Paul Atreides...')
  })

  it('leaves original film fields intact', () => {
    const merged = mergeTmdb(baseFilm, fullTmdb)
    expect(merged.title).toBe(baseFilm.title)
    expect(merged.year).toBe(baseFilm.year)
    expect(merged.rating).toBe(baseFilm.rating)
    expect(merged.posterUrl).toBe(baseFilm.posterUrl)
    expect(merged.filmId).toBe(baseFilm.filmId)
  })

  it('stores undefined (not empty string) when TMDB fields are empty', () => {
    const sparseTmdb: TmdbFilmData = {
      ...fullTmdb,
      posterUrl: '',
      backdropUrl: '',
      director: '',
      runtime: 0,
      genres: [],
      overview: '',
    }
    const merged = mergeTmdb(baseFilm, sparseTmdb)
    expect(merged.tmdbPosterUrl).toBeUndefined()
    expect(merged.tmdbBackdropUrl).toBeUndefined()
    expect(merged.director).toBeUndefined()
    expect(merged.runtime).toBeUndefined()
    expect(merged.genres).toBeUndefined()
    expect(merged.overview).toBeUndefined()
  })
})

describe('didUseTmdb', () => {
  const bareFilm: FilmData = {
    title: 'Dune', year: '2021', rating: '', posterUrl: '', filmId: '1',
  }

  it('returns false when no film has TMDB fields and the backdrop is non-TMDB', () => {
    expect(didUseTmdb([bareFilm], 'https://letterboxd.com/backdrop.jpg')).toBe(false)
    expect(didUseTmdb([bareFilm], '')).toBe(false)
    expect(didUseTmdb([bareFilm])).toBe(false)
  })

  it('returns true when any film has a TMDB poster URL', () => {
    expect(didUseTmdb([{ ...bareFilm, tmdbPosterUrl: 'https://image.tmdb.org/x.jpg' }])).toBe(true)
  })

  it('returns true when any film has a TMDB backdrop URL', () => {
    expect(didUseTmdb([{ ...bareFilm, tmdbBackdropUrl: 'https://image.tmdb.org/y.jpg' }])).toBe(true)
  })

  it('returns true when the top-level backdrop came from TMDB', () => {
    expect(didUseTmdb([bareFilm], 'https://image.tmdb.org/t/p/original/z.jpg')).toBe(true)
  })

  // The footgun this function closes: TMDB may provide only text fields
  // (director, runtime, genres, overview) with no poster or backdrop. If the
  // renderer ever draws those fields, attribution must still show.
  it('returns true when TMDB supplied only a director', () => {
    expect(didUseTmdb([{ ...bareFilm, director: 'Denis Villeneuve' }])).toBe(true)
  })

  it('returns true when TMDB supplied only a runtime', () => {
    expect(didUseTmdb([{ ...bareFilm, runtime: 155 }])).toBe(true)
  })

  it('returns true when TMDB supplied only genres', () => {
    expect(didUseTmdb([{ ...bareFilm, genres: ['Science Fiction'] }])).toBe(true)
  })

  it('returns true when TMDB supplied only an overview', () => {
    expect(didUseTmdb([{ ...bareFilm, overview: 'Paul Atreides...' }])).toBe(true)
  })

  it('returns false for an empty genres array (no data actually used)', () => {
    expect(didUseTmdb([{ ...bareFilm, genres: [] }])).toBe(false)
  })
})
