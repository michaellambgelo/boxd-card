/**
 * Web-app client for the worker's /tmdb endpoint.
 *
 * Given a Letterboxd film slug, the worker scrapes data-tmdb-id from the film
 * page and queries TMDB. We only ever talk to our own worker — the TMDB API
 * key never reaches the browser.
 *
 * The extension uses a different transport (background service worker's
 * FETCH_TMDB message); shared types and helpers live in src/shared/tmdb.ts.
 */

export { slugFromPosterUrl, type TmdbFilmData } from '../shared/tmdb'
import type { TmdbFilmData } from '../shared/tmdb'

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
