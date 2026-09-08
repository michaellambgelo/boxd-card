/**
 * Letterboxd page filters, and how a card URL keeps them.
 *
 * Letterboxd lets you narrow almost any listing page, and it does it entirely
 * in the path rather than a query string. There are two shapes, and they sit on
 * opposite sides of the section:
 *
 *   PREFIX   /<user>/tag/<tag>/diary/            "diary entries tagged in-theaters"
 *   SUFFIX   /<user>/diary/films/decade/1990s/   "diary entries from the 1990s"
 *
 * Suffixes chain freely — by/rating, genre/horror, rated/5, on/hulu-us, page/2,
 * size/large, not/on/favorite-services, on/favorite-services/type/buy — and
 * Letterboxd adds to that vocabulary whenever it likes. So this module does not
 * keep an allowlist: whatever follows the section is carried through verbatim
 * and handed back to Letterboxd, which is the only thing that can actually say
 * whether a filter is real.
 *
 * The filtered pages are structurally IDENTICAL to their unfiltered versions —
 * a tag-filtered diary is still table#diary-table with tr.diary-entry-row, a
 * tag-filtered /films/ is still ul.grid li.griditem — so no scraper needs to
 * change. Only the routing did.
 *
 * ONE ASYMMETRY BETWEEN THE SURFACES. Letterboxd's bot rules challenge the
 * /tag/ prefix specifically. Measured through the proxy with interleaved
 * controls, twice, four minutes apart:
 *
 *   /<user>/diary/                     200
 *   /<user>/tag/in-theaters/diary/     403  "Just a moment..."
 *   /<user>/diary/                     200
 *   /<user>/diary/films/decade/1990s/  200  (correctly filtered)
 *
 * So suffix filters work on both surfaces, and tag filters work only in the
 * extension, which reads the page the user is already looking at rather than
 * fetching it. That is the same situation as stats pages, and it gets the same
 * treatment: an honest message rather than a card that quietly ignores the
 * filter. See isProxyBlockedFilter().
 */

/** A filter carried alongside a card URL. Both fields are '' when unfiltered. */
export interface UrlFilter {
  /** Tag slug from the /tag/<tag>/ prefix, e.g. "in-theaters". */
  tag: string
  /** Path segments after the section, e.g. "films/decade/1990s". No slashes at either end. */
  suffix: string
}

export const NO_FILTER: UrlFilter = { tag: '', suffix: '' }

export function isFiltered(f: UrlFilter): boolean {
  return !!(f.tag || f.suffix)
}

/**
 * True when this filter cannot be fetched through the proxy, so the web app
 * must decline rather than silently produce an unfiltered card.
 */
export function isProxyBlockedFilter(f: UrlFilter): boolean {
  return !!f.tag
}

/** Segments Letterboxd uses for paging/presentation rather than content. */
const NON_CONTENT_KEYS = new Set(['page', 'size'])

/** Filter keys whose value reads better on its own than with the key. */
const VALUE_ONLY_KEYS = new Set(['decade', 'genre', 'year'])

function titleCase(slug: string): string {
  return slug.split('-').map(w => w ? w[0].toUpperCase() + w.slice(1) : w).join(' ')
}

/**
 * A short human description of a filter, for the card's type label.
 *
 * Deliberately lossy and forgiving: the suffix vocabulary is Letterboxd's and
 * grows without notice, so an unrecognised key falls back to reading the
 * segments out rather than throwing away the fact that a filter is present.
 * Paging and poster-size segments are dropped — they change what you see, not
 * what the card is *about*.
 */
export function describeFilter(f: UrlFilter): string {
  const parts: string[] = []
  if (f.tag) parts.push(`tagged ${f.tag}`)

  const segs = f.suffix.split('/').filter(Boolean)
  // "films" is a section marker Letterboxd inserts before suffix filters
  // (/diary/films/decade/1990s/), not a filter in its own right.
  if (segs[0] === 'films') segs.shift()

  for (let i = 0; i < segs.length; i += 2) {
    const key = segs[i]
    const value = segs[i + 1]
    if (NON_CONTENT_KEYS.has(key)) continue
    if (!value) { parts.push(titleCase(key)); break }
    if (VALUE_ONLY_KEYS.has(key)) parts.push(value)
    else if (key === 'by') parts.push(`by ${value.replace(/-/g, ' ')}`)
    else parts.push(`${key} ${value.replace(/-/g, ' ')}`)
  }

  return parts.join(' · ')
}

/** Card-type label with the filter appended, e.g. "Recent Diary · tagged in-theaters". */
export function labelWithFilter(cardTypeLabel: string, f: UrlFilter): string {
  const described = describeFilter(f)
  return described ? `${cardTypeLabel} · ${described}` : cardTypeLabel
}

/**
 * Rebuild a Letterboxd URL, putting each half of the filter back where it came
 * from. `sectionPath` is everything between the username and the suffix, e.g.
 * "diary" or "list/my-2026-releases-ranked".
 */
export function withFilter(username: string, sectionPath: string, f: UrlFilter): string {
  const tagPart = f.tag ? `tag/${f.tag}/` : ''
  const section = sectionPath ? `${sectionPath.replace(/^\/+|\/+$/g, '')}/` : ''
  const suffix = f.suffix ? `${f.suffix.replace(/^\/+|\/+$/g, '')}/` : ''
  return `https://letterboxd.com/${username}/${tagPart}${section}${suffix}`
}
