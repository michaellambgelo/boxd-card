/**
 * Letterboxd URL routing, shared by both surfaces.
 *
 * This lives in shared/ rather than web/ for two reasons. The obvious one is
 * that the extension needs it too. The load-bearing one is that web/webScraper
 * imports ./faro, and the privacy policy says the extension sends no telemetry
 * at all — so anything the extension imports must stay clear of that module.
 *
 * It also replaces CARD_TYPE_CONFIGS.urlPattern, which was a second, independent
 * answer to "does this URL support this card type" maintained as six anchored
 * regexes. Two sources of truth for the same question is the shape of bug this
 * codebase has already paid for once; filters made it acute, because loosening
 * six patterns by hand is how `last-four-watched` ends up matching every page.
 */

import type { CardType } from '../types'
import { NO_FILTER, type UrlFilter } from './urlFilter'

export interface ParsedLetterboxdUrl {
  username: string
  /** null when the URL is a profile page (ambiguous: could be last-four-watched or favorites) */
  cardType: CardType | null
  listSlug: string
  /** true only for /reviews/ list pages; false for single film review pages */
  isReviewListPage: boolean
  /** non-empty for single film review pages: the film slug from the URL */
  filmSlug: string
  /**
   * Any Letterboxd page filter carried by the URL — a /tag/<tag>/ prefix and/or
   * trailing segments like films/decade/1990s. NO_FILTER when unfiltered.
   * buildPageUrl puts both halves back; without this the filter was silently
   * dropped and the card came out unfiltered with no error.
   */
  filter: UrlFilter
}

/**
 * Parse a letterboxd.com URL into its component parts.
 * Returns null when the URL is not a recognisable Letterboxd or boxd.it URL.
 * Returns { cardType: null } for profile-page URLs that are ambiguous between
 * last-four-watched and favorites.
 */
export function parseLetterboxdUrl(input: string): ParsedLetterboxdUrl | null {
  let parsed: URL
  try { parsed = new URL(input) } catch { return null }

  const hostname = parsed.hostname.replace(/^www\./, '')

  // Short URL — card type can't be determined without fetching
  if (hostname === 'boxd.it') {
    return { username: '', cardType: null, listSlug: '', isReviewListPage: false, filmSlug: '', filter: NO_FILTER }
  }

  if (hostname !== 'letterboxd.com') return null

  // Strip leading/trailing slashes, split path segments
  const parts = parsed.pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean)
  const username = parts[0]
  if (!username) return null

  // A tag filter sits BEFORE the section: /<user>/tag/<tag>/diary/. Lift it out
  // so the section logic below sees the same shape it always has.
  let rest = parts.slice(1)
  let tag = ''
  if (rest[0] === 'tag' && rest[1]) {
    tag = rest[1]
    rest = rest.slice(2)
  }

  const section = rest[0]  // undefined | 'films' | 'diary' | 'list' | 'reviews' | 'film' | ...
  const subpart = rest[1]  // undefined | list-slug | film-slug | ...

  /** Everything past the section is a filter we preserve verbatim. */
  const from = (n: number): UrlFilter => ({ tag, suffix: rest.slice(n).join('/') })

  if (!section) {
    // https://letterboxd.com/username/ — could be last-four-watched or
    // favorites, so let the caller decide.
    return { username, cardType: null, listSlug: '', isReviewListPage: false, filmSlug: '', filter: from(0) }
  }
  if (section === 'films' && subpart !== 'diary') {
    // Keep 'films' inside the suffix rather than consuming it. /<user>/ and
    // /<user>/films/ are different pages that both make a last-four-watched
    // card, and the suffix filters hang off /films/ -- dropping the segment
    // rebuilt /<user>/tag/x/films/by/rating/ as /<user>/tag/x/by/rating/, which
    // is not a page. describeFilter() strips it back out for the label.
    return { username, cardType: 'last-four-watched', listSlug: '', isReviewListPage: false, filmSlug: '', filter: from(0) }
  }
  if (section === 'diary' || (section === 'films' && subpart === 'diary')) {
    const consumed = section === 'diary' ? 1 : 2
    return { username, cardType: 'recent-diary', listSlug: '', isReviewListPage: false, filmSlug: '', filter: from(consumed) }
  }
  if (section === 'list' && subpart) {
    return { username, cardType: 'list', listSlug: subpart, isReviewListPage: false, filmSlug: '', filter: from(2) }
  }
  if (section === 'reviews') {
    return { username, cardType: 'review', listSlug: '', isReviewListPage: true, filmSlug: '', filter: from(1) }
  }
  if (section === 'film' && subpart) {
    // Single film review: /username/film/slug/ or /username/film/slug/N/
    const entryNum = rest[2] // e.g. '6' for the 6th viewing of the same film
    const isEntryNum = !!entryNum && /^\d+$/.test(entryNum)
    const filmSlug = isEntryNum ? `${subpart}/${entryNum}` : subpart
    return { username, cardType: 'review', listSlug: '', isReviewListPage: false, filmSlug, filter: from(isEntryNum ? 3 : 2) }
  }
  // Stats is the one section that takes NO trailing segments. Letterboxd offers
  // no filters there, and `/stats/YYYY/` specifically 404s -- it was accepted
  // here once and produced a hint that dead-ended. Being permissive everywhere
  // else would quietly resurrect it, so stats stays exact.
  if (section === 'stats' && rest.length === 1) {
    return { username, cardType: 'stats', listSlug: '', isReviewListPage: false, filmSlug: '', filter: from(1) }
  }
  if (section === 'year' && subpart && /^\d{4}$/.test(subpart) && rest.length === 2) {
    return { username, cardType: 'stats', listSlug: '', isReviewListPage: false, filmSlug: '', filter: from(2) }
  }

  return null
}

/**
 * Whether `url` is a page the given card type can be built from.
 *
 * A bare profile URL is deliberately ambiguous — it serves both
 * last-four-watched and favorites — so it answers true for either.
 */
export function supportsCardType(url: string, cardType: CardType): boolean {
  const parsed = parseLetterboxdUrl(url)
  if (!parsed || !parsed.username) return false
  if (parsed.cardType === null) {
    return cardType === 'last-four-watched' || cardType === 'favorites'
  }
  return parsed.cardType === cardType
}

/** First card type the URL supports, in CARD_TYPES order, or null. */
export function detectCardType(url: string, order: readonly CardType[]): CardType | null {
  return order.find(t => supportsCardType(url, t)) ?? null
}
