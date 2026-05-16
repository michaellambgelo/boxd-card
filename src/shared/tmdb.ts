/**
 * Shared TMDB primitives used by both the web app and the extension.
 *
 * The network path differs by runtime:
 * - Web app:   calls the Cloudflare Worker directly via fetchTmdbData()
 *              in src/web/tmdbClient.ts.
 * - Extension: routes through the background service worker's FETCH_TMDB
 *              message so it lives behind the same host_permissions model
 *              as FETCH_IMAGE.
 *
 * The slug parsing and merge logic are identical in both paths, so they
 * live here.
 */

import type { FilmData } from '../content/index'

export interface TmdbFilmData {
  tmdbId: number
  type: 'movie' | 'tv'
  title: string
  releaseDate: string
  runtime: number
  overview: string
  director: string
  genres: string[]
  posterUrl: string    // https://image.tmdb.org/t/p/original/... or ''
  backdropUrl: string
}

/**
 * Extract the Letterboxd film slug from any URL or path that contains
 * `/film/<slug>/…`. Handles:
 *   https://letterboxd.com/film/dune-2021/image-150/   (web scraper's posterUrl)
 *   /film/dune-2021/image-150/                         (raw data-poster-url)
 *   https://letterboxd.com/film/dune-2021/             (bare film URL)
 *
 * Resolved CDN URLs (a.ltrbxd.com/resized/film-poster/…) contain
 * `/film-poster/`, not `/film/`, and correctly yield '' — the caller should
 * fall back to scrape-time `filmSlug` in that case. Returns '' when no match.
 */
export function slugFromPosterUrl(posterUrl: string): string {
  const m = posterUrl.match(/\/film\/([^/]+)\//)
  return m?.[1] ?? ''
}

export function mergeTmdb(film: FilmData, tmdb: TmdbFilmData): FilmData {
  return {
    ...film,
    tmdbPosterUrl:   tmdb.posterUrl || undefined,
    tmdbBackdropUrl: tmdb.backdropUrl || undefined,
    director:        tmdb.director || undefined,
    runtime:         tmdb.runtime || undefined,
    genres:          tmdb.genres.length ? tmdb.genres : undefined,
    overview:        tmdb.overview || undefined,
  }
}

/**
 * Returns true if any TMDB-sourced field is present on any film, or if the
 * card's backdrop came from TMDB's CDN. Used to decide whether to draw the
 * TMDB attribution logo on the card — TMDB's API-usage policy requires
 * attribution whenever any image or data from TMDB is used, so this check
 * covers every field mergeTmdb can populate, not just posters and backdrops.
 */
export function didUseTmdb(
  films: Pick<FilmData, 'tmdbPosterUrl' | 'tmdbBackdropUrl' | 'director' | 'runtime' | 'genres' | 'overview'>[],
  backdropUrl?: string,
): boolean {
  if (backdropUrl?.startsWith('https://image.tmdb.org/')) return true
  return films.some(f =>
    !!f.tmdbPosterUrl ||
    !!f.tmdbBackdropUrl ||
    !!f.director ||
    f.runtime !== undefined ||
    (f.genres?.length ?? 0) > 0 ||
    !!f.overview,
  )
}
