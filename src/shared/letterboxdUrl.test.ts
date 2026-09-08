import { describe, it, expect } from 'vitest'
import { parseLetterboxdUrl, supportsCardType, detectCardType } from './letterboxdUrl'
import { describeFilter, labelWithFilter, isProxyBlockedFilter, withFilter, NO_FILTER } from './urlFilter'
import { CARD_TYPES } from '../types'

const u = (path: string) => `https://letterboxd.com${path}`

describe('filtered URLs keep their filter', () => {
  it('parses the tag-filtered diary that used to be rejected outright', () => {
    // The reported break: "diary entries tagged in-theaters". /tag/ sits BEFORE
    // the section, so the old parser saw section === 'tag' and returned null.
    const r = parseLetterboxdUrl(u('/michaellamb/tag/in-theaters/diary/'))
    expect(r?.cardType).toBe('recent-diary')
    expect(r?.username).toBe('michaellamb')
    expect(r?.filter).toEqual({ tag: 'in-theaters', suffix: '' })
  })

  it('parses a suffix filter and keeps it', () => {
    const r = parseLetterboxdUrl(u('/michaellamb/diary/films/decade/1990s/'))
    expect(r?.cardType).toBe('recent-diary')
    expect(r?.filter).toEqual({ tag: '', suffix: 'films/decade/1990s' })
  })

  it('keeps a chained suffix verbatim rather than allowlisting it', () => {
    // Letterboxd grows this vocabulary without notice, and it is the only thing
    // that can say whether a filter is real, so we pass it straight through.
    const r = parseLetterboxdUrl(u('/michaellamb/films/on/favorite-services/type/buy/'))
    expect(r?.cardType).toBe('last-four-watched')
    expect(r?.filter.suffix).toBe('films/on/favorite-services/type/buy')
  })

  // 'films' stays in the suffix: /<user>/ and /<user>/films/ are different
  // pages that both make this card, and the filters hang off /films/.
  it('combines a tag prefix with a suffix filter', () => {
    const r = parseLetterboxdUrl(u('/michaellamb/tag/in-theaters/films/by/rating/'))
    expect(r?.cardType).toBe('last-four-watched')
    expect(r?.filter).toEqual({ tag: 'in-theaters', suffix: 'films/by/rating' })
  })

  it('reports no filter for a plain URL', () => {
    expect(parseLetterboxdUrl(u('/michaellamb/diary/'))?.filter).toEqual(NO_FILTER)
  })

  it('does not mistake a review entry number for a filter', () => {
    const r = parseLetterboxdUrl(u('/michaellamb/film/akira/2/'))
    expect(r?.filmSlug).toBe('akira/2')
    expect(r?.filter).toEqual(NO_FILTER)
  })

  it('treats a non-numeric segment after a film slug as a filter', () => {
    const r = parseLetterboxdUrl(u('/michaellamb/film/akira/activity/'))
    expect(r?.filmSlug).toBe('akira')
    expect(r?.filter.suffix).toBe('activity')
  })
})

describe('buildPageUrl round-trip', () => {
  // The silent half of the bug: filtered URLs parsed fine, then the URL was
  // rebuilt from username + cardType alone and the filter vanished, so the card
  // came out unfiltered with no error at all.
  it.each([
    '/michaellamb/tag/in-theaters/diary/',
    '/michaellamb/diary/films/decade/1990s/',
    '/michaellamb/tag/in-theaters/films/by/rating/',
    '/michaellamb/list/my-list/detail/',
    '/michaellamb/diary/',
  ])('rebuilds %s unchanged', async (path) => {
    const { buildPageUrl } = await import('../web/webScraper')
    const r = parseLetterboxdUrl(u(path))!
    const rebuilt = buildPageUrl(r.username, r.cardType ?? 'last-four-watched', r.listSlug, r.filmSlug, r.filter)
    expect(rebuilt).toBe(u(path))
  })
})

describe('stats takes no filters', () => {
  it('accepts the two real stats pages', () => {
    expect(supportsCardType(u('/michaellamb/stats/'), 'stats')).toBe(true)
    expect(supportsCardType(u('/michaellamb/year/2025/'), 'stats')).toBe(true)
  })

  it('still rejects /stats/YYYY/, which 404s', () => {
    // Permissive suffix handling would quietly resurrect this dead URL.
    expect(parseLetterboxdUrl(u('/michaellamb/stats/2025/'))).toBeNull()
  })
})

describe('supportsCardType / detectCardType', () => {
  it('accepts a filtered page for its card type', () => {
    expect(supportsCardType(u('/michaellamb/tag/in-theaters/diary/'), 'recent-diary')).toBe(true)
  })

  it('does not let one card type claim another type page', () => {
    // The failure mode of hand-loosening six anchored regexes: last-four-watched
    // grows a `.*` and starts matching every page on the site.
    expect(supportsCardType(u('/michaellamb/tag/in-theaters/diary/'), 'last-four-watched')).toBe(false)
    expect(supportsCardType(u('/michaellamb/list/foo/'), 'recent-diary')).toBe(false)
    expect(supportsCardType(u('/michaellamb/reviews/'), 'last-four-watched')).toBe(false)
  })

  it('treats a bare profile as valid for both types it can serve', () => {
    expect(supportsCardType(u('/michaellamb/'), 'last-four-watched')).toBe(true)
    expect(supportsCardType(u('/michaellamb/'), 'favorites')).toBe(true)
    expect(detectCardType(u('/michaellamb/'), CARD_TYPES)).toBe('last-four-watched')
  })

  it('rejects non-Letterboxd URLs', () => {
    expect(supportsCardType('https://example.com/foo/', 'recent-diary')).toBe(false)
  })
})

describe('describeFilter', () => {
  it.each([
    [{ tag: 'in-theaters', suffix: '' }, 'tagged in-theaters'],
    [{ tag: '', suffix: 'films/decade/1990s' }, '1990s'],
    [{ tag: '', suffix: 'films/genre/horror' }, 'horror'],
    [{ tag: '', suffix: 'by/rating' }, 'by rating'],
    [{ tag: '', suffix: 'on/hulu-us' }, 'on hulu us'],
    [{ tag: 'in-theaters', suffix: 'by/rating' }, 'tagged in-theaters · by rating'],
    [{ tag: '', suffix: '' }, ''],
  ])('describes %j', (filter, expected) => {
    expect(describeFilter(filter)).toBe(expected)
  })

  it('ignores paging and poster-size segments, which are not what a card is about', () => {
    expect(describeFilter({ tag: '', suffix: 'films/page/2' })).toBe('')
    expect(describeFilter({ tag: 'in-theaters', suffix: 'size/large' })).toBe('tagged in-theaters')
  })

  it('degrades gracefully on a filter vocabulary it has never seen', () => {
    const described = describeFilter({ tag: '', suffix: 'someday/some-value' })
    expect(described).toBe('someday some value')
  })

  it('appends to the card label only when there is a filter', () => {
    expect(labelWithFilter('Recent Diary', { tag: 'in-theaters', suffix: '' }))
      .toBe('Recent Diary · tagged in-theaters')
    expect(labelWithFilter('Recent Diary', NO_FILTER)).toBe('Recent Diary')
  })
})

describe('isProxyBlockedFilter', () => {
  // Measured through the production proxy with interleaved controls, twice:
  //   /<user>/diary/                    200
  //   /<user>/tag/in-theaters/diary/    403 "Just a moment..."
  //   /<user>/diary/films/decade/1990s/ 200, correctly filtered
  it('flags tag filters, which Letterboxd challenges for non-browsers', () => {
    expect(isProxyBlockedFilter({ tag: 'in-theaters', suffix: '' })).toBe(true)
  })

  it('does not flag suffix filters, which the proxy fetches fine', () => {
    expect(isProxyBlockedFilter({ tag: '', suffix: 'films/decade/1990s' })).toBe(false)
    expect(isProxyBlockedFilter(NO_FILTER)).toBe(false)
  })
})

describe('withFilter', () => {
  it('puts each half back on its own side of the section', () => {
    expect(withFilter('u', 'diary', { tag: 'in-theaters', suffix: 'by/rating' }))
      .toBe('https://letterboxd.com/u/tag/in-theaters/diary/by/rating/')
  })

  it('handles an empty section (profile pages)', () => {
    expect(withFilter('u', '', NO_FILTER)).toBe('https://letterboxd.com/u/')
  })
})
