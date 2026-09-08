/**
 * LazyPoster attribute reading, shared by both scrapers.
 *
 * Letterboxd renders every film poster as a `LazyPoster` React component. What
 * that component *serves* has changed twice now, and each change silently broke
 * a surface:
 *
 *   2026-08  data-film-id removed; the numeric id moved into the JSON of
 *            data-postered-identifier / data-resolvable-poster-path.
 *   2026-09  data-poster-url removed. Server-rendered HTML no longer contains a
 *            film poster URL at all — img.src is an empty-poster placeholder and
 *            the real URL is resolved client-side after hydration. Verified
 *            through the proxy on profile, diary, list, /films/ and review
 *            pages: zero occurrences, while data-item-slug / data-item-link
 *            appear on every poster.
 *
 * Both scrapers now read through this one module so a third change breaks one
 * place, and so the web app stops being a strictly weaker reader than the
 * extension.
 *
 * THE /image-150/ PATH IS A TOKEN, NOT A FETCHABLE URL. Requesting
 * `/film/<slug>/image-150/` through the proxy returns 403 (Cloudflare
 * challenge), exactly like `/film/<slug>/json/`. It works only because
 * fetchImageDataUrl() in web/webScraper.ts intercepts that exact shape and
 * redirects to the film page's JSON-LD. The trailing slash is load-bearing —
 * the interception regex is anchored. Anything that fetches a posterUrl without
 * going through fetchImageDataUrl will 403.
 */

import { slugFromPosterUrl } from './tmdb'

const LETTERBOXD_ORIGIN = 'https://letterboxd.com'

/** img.src starts as this placeholder and is swapped in by React after load. */
export const EMPTY_POSTER_MARKER = 'empty-poster'

/** Which rung of the ladder produced a poster URL. Structural, never content. */
export type PosterRung =
  | 'img-src'
  | 'data-poster-url'
  | 'data-item-link'
  | 'data-item-slug'
  | 'postered-base-link'
  | 'none'

export interface LazyPosterFields {
  /** Poster URL or /image-150/ token; '' when nothing could be resolved. */
  posterUrl: string
  /** Letterboxd film slug, or '' — survives img.src being resolved to a CDN URL. */
  filmSlug: string
  /** Which rung won. For telemetry, so the next attribute removal is visible. */
  rung: PosterRung
}

/** Parse one of the JSON-valued LazyPoster attributes. Returns null if absent/malformed. */
function attrJson(lazyPoster: Element | null, attr: string): Record<string, unknown> | null {
  const raw = lazyPoster?.getAttribute(attr)
  if (!raw) return null
  // getAttribute() hands back decoded text, so the &quot;-escaped JSON in the
  // raw HTML parses under both DOMParser and the live DOM.
  try {
    const parsed: unknown = JSON.parse(raw)
    return (parsed && typeof parsed === 'object') ? parsed as Record<string, unknown> : null
  } catch {
    return null
  }
}

/**
 * The numeric film id.
 *
 * Prefers the legacy data-film-id if it ever returns, then parses "film:<n>"
 * out of the uid in either JSON attribute. Returns '' when no id can be found.
 *
 * Getting this wrong is not obvious: filmId's one consumer is the milestone
 * poster map, and when every id is '' the map collapses to a single key and
 * every milestone renders the same poster.
 */
export function filmIdFromLazyPoster(lazyPoster: Element | null): string {
  const legacy = lazyPoster?.getAttribute('data-film-id')
  if (legacy) return legacy
  for (const attr of ['data-postered-identifier', 'data-resolvable-poster-path']) {
    const parsed = attrJson(lazyPoster, attr)
    if (!parsed) continue
    const postered = parsed.postered as Record<string, unknown> | undefined
    const uid = (parsed.uid ?? postered?.uid) as string | undefined
    const m = uid?.match(/^film:(\d+)$/)
    if (m) return m[1]
  }
  return ''
}

/**
 * True when Letterboxd is rendering a non-default poster — a Pro/Patron
 * member's own choice, or a film-level preferred alternative. Default posters
 * omit preferredAlternativePosterId entirely.
 *
 * Do NOT use the sibling hasDefaultPoster field: it stays true even when a
 * custom poster is displayed, because it describes the film, not the screen.
 */
export function isCustomPoster(lazyPoster: Element | null): boolean {
  const parsed = attrJson(lazyPoster, 'data-resolvable-poster-path')
  return !!parsed?.preferredAlternativePosterId
}

/** A Letterboxd slug: lowercase alphanumerics in hyphen-separated groups. */
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * The film slug, read from structured attributes only.
 *
 * Never returns a CDN URL, so it stays correct after img.src has been resolved
 * — that is the whole point. A resolved poster URL is
 * `a.ltrbxd.com/resized/film-poster/...`, which contains `/film-poster/` rather
 * than `/film/` and so yields '' from slugFromPosterUrl.
 *
 * Every rung is validated through slugFromPosterUrl (or the slug shape), so a
 * future non-film item-link — a `/list/` or a `/tv/` entry — falls through to
 * the next rung instead of producing a URL that 403s.
 */
export function filmSlugFromLazyPoster(lazyPoster: Element | null): string {
  const dataPosterUrl = lazyPoster?.getAttribute('data-poster-url') ?? ''
  const fromPosterUrl = slugFromPosterUrl(dataPosterUrl)
  if (fromPosterUrl) return fromPosterUrl

  const itemLink = lazyPoster?.getAttribute('data-item-link') ?? ''
  const fromItemLink = slugFromPosterUrl(itemLink)
  if (fromItemLink) return fromItemLink

  const itemSlug = (lazyPoster?.getAttribute('data-item-slug') ?? '').trim()
  if (SLUG_RE.test(itemSlug)) return itemSlug

  const baseLink = attrJson(lazyPoster, 'data-resolvable-poster-path')?.posteredBaseLink
  if (typeof baseLink === 'string') {
    const fromBaseLink = slugFromPosterUrl(baseLink)
    if (fromBaseLink) return fromBaseLink
  }

  return ''
}

/**
 * Resolve everything the scrapers need from one LazyPoster element.
 *
 * `resolvedSrc` is the live img.src and is meaningful only in the extension,
 * where React has already run — it is the ONLY rung that reflects a per-entry
 * custom poster, so it wins when it isn't the placeholder. Pass '' when parsing
 * fetched HTML, where img.src is always the placeholder.
 *
 * The remaining rungs are ordered most-specific first. data-poster-url stays at
 * the top even though Letterboxd currently emits none: it costs one
 * getAttribute and self-heals if the attribute returns.
 */
export function resolveLazyPoster(
  lazyPoster: Element | null,
  resolvedSrc = '',
): LazyPosterFields {
  const filmSlug = filmSlugFromLazyPoster(lazyPoster)

  if (resolvedSrc && !resolvedSrc.includes(EMPTY_POSTER_MARKER)) {
    return { posterUrl: resolvedSrc, filmSlug, rung: 'img-src' }
  }

  // Kept verbatim rather than rebuilt from filmSlug: this path can point at a
  // specific alternative poster image, which /film/<slug>/image-150/ cannot.
  const dataPosterUrl = lazyPoster?.getAttribute('data-poster-url') ?? ''
  if (dataPosterUrl) {
    return { posterUrl: `${LETTERBOXD_ORIGIN}${dataPosterUrl}`, filmSlug, rung: 'data-poster-url' }
  }

  if (filmSlug) {
    // Trailing slash is required — fetchImageDataUrl's regex is anchored on it.
    return {
      posterUrl: `${LETTERBOXD_ORIGIN}/film/${filmSlug}/image-150/`,
      filmSlug,
      rung: rungForSlug(lazyPoster),
    }
  }

  return { posterUrl: '', filmSlug: '', rung: 'none' }
}

/** Which structured attribute the slug came from, for telemetry only. */
function rungForSlug(lazyPoster: Element | null): PosterRung {
  if (slugFromPosterUrl(lazyPoster?.getAttribute('data-item-link') ?? '')) return 'data-item-link'
  if (SLUG_RE.test((lazyPoster?.getAttribute('data-item-slug') ?? '').trim())) return 'data-item-slug'
  return 'postered-base-link'
}

/** Convenience wrapper for call sites that only want the URL. */
export function posterUrlFromLazyPoster(lazyPoster: Element | null, resolvedSrc = ''): string {
  return resolveLazyPoster(lazyPoster, resolvedSrc).posterUrl
}

/**
 * List-entry selector, shared by both scrapers.
 *
 * Letterboxd renamed the container ul.js-list-entries -> ul.poster-list
 * (verified live 2026-09-08: zero js-list-entries on a list page). The legacy
 * pair is kept for the same reason data-poster-url is kept in the ladder.
 *
 * li.posteritem MUST stay scoped AND discriminated. Unscoped it also matches the
 * "recent lists" sidebar on a profile (20 hits, under ul.posterlist — note: no
 * hyphen) and the related-films strip on a film page (6 hits, under
 * ul.poster-list — with hyphen). data-object-name="list" separates them
 * cleanly: 33/33 on a list page, 0 on both of the others.
 *
 * li.film-detail is UNVERIFIED — the /detail/ view is 403-challenged through the
 * proxy, so it could not be checked against live markup. It is kept, scoped, on
 * the assumption it moved with its sibling.
 */
export const LIST_ENTRY_SELECTOR = [
  'ul.poster-list li.posteritem[data-object-name="list"]',
  'ul.poster-list li.film-detail',
  'ul.js-list-entries li.posteritem',
  'ul.js-list-entries li.film-detail',
].join(', ')
