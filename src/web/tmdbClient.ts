/**
 * Client for the worker's /tmdb endpoint.
 *
 * Given a Letterboxd film slug, the worker scrapes data-tmdb-id from the film
 * page and queries TMDB. We only ever talk to our own worker — the TMDB API
 * key never reaches the browser.
 */

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

const PROXY_BASE: string =
  (import.meta.env.VITE_PROXY_URL as string | undefined) ??
  'https://boxd-card.michaellamb.workers.dev'

/**
 * Fetch TMDB data for a Letterboxd film slug.
 * Returns null when the slug has no mapping (404); throws on other failures.
 */
export async function fetchTmdbData(slug: string): Promise<TmdbFilmData | null> {
  if (!slug) return null
  const res = await fetch(`${PROXY_BASE}/tmdb?slug=${encodeURIComponent(slug)}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching TMDB data`)
  return (await res.json()) as TmdbFilmData
}

/**
 * Extract the Letterboxd film slug from a poster URL of the form
 *   https://letterboxd.com/film/<slug>/image-NNN/
 * Returns '' when the URL doesn't match that pattern.
 *
 * Review URLs may have a trailing "/N/" disambiguator (e.g. "dune-2021/3") —
 * we strip it because the film slug alone is what TMDB lookups key on.
 */
export function slugFromPosterUrl(posterUrl: string): string {
  const m = posterUrl.match(/letterboxd\.com\/film\/([^/]+)\//)
  return m?.[1] ?? ''
}
