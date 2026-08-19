import { describe, it, expect } from 'vitest'
import { formatUrlHint, formatUrlHintSegments, CARD_TYPE_CONFIGS, CARD_TYPES, STATS_CATEGORIES, isYearStatsUrl, isStatsCategoryAvailable, statsCategoryUnavailableMessage } from './types'
import type { StatsCategory } from './types'

describe('formatUrlHint', () => {
  it('substitutes a real username into a single-placeholder hint', () => {
    expect(formatUrlHint('recent-diary', 'michaellamb')).toBe('letterboxd.com/michaellamb/diary/')
  })

  it('falls back to "username" when no username is provided', () => {
    expect(formatUrlHint('recent-diary')).toBe('letterboxd.com/username/diary/')
  })

  it('substitutes every {user} occurrence', () => {
    expect(formatUrlHint('last-four-watched', 'jane')).toBe('letterboxd.com/jane/ or letterboxd.com/jane/films/')
  })

  it('trims whitespace-only usernames and falls back to generic', () => {
    expect(formatUrlHint('list', '   ')).toBe('letterboxd.com/username/list/')
  })

  it('substitutes the username across the remaining multi-segment card types', () => {
    expect(formatUrlHint('list', 'jane')).toBe('letterboxd.com/jane/list/')
    expect(formatUrlHint('review', 'jane')).toBe('letterboxd.com/jane/reviews/')
    expect(formatUrlHint('stats', 'jane')).toBe('letterboxd.com/jane/stats/')
  })

  it('has no stray {user} tokens for any card type', () => {
    for (const ct of CARD_TYPES) {
      expect(formatUrlHint(ct, 'jane')).not.toContain('{user}')
      expect(formatUrlHint(ct)).not.toContain('{user}')
    }
  })
})

describe('formatUrlHintSegments', () => {
  it('returns a single plain-text segment when logged out', () => {
    expect(formatUrlHintSegments('recent-diary')).toEqual([
      { kind: 'text', text: 'letterboxd.com/username/diary/' },
    ])
    expect(formatUrlHintSegments('recent-diary', '   ')).toEqual([
      { kind: 'text', text: 'letterboxd.com/username/diary/' },
    ])
  })

  it('wraps a single URL in a link when logged in (favorites, recent-diary)', () => {
    expect(formatUrlHintSegments('favorites', 'jane')).toEqual([
      { kind: 'link', text: 'letterboxd.com/jane/', href: 'https://letterboxd.com/jane/' },
    ])
    expect(formatUrlHintSegments('recent-diary', 'jane')).toEqual([
      { kind: 'link', text: 'letterboxd.com/jane/diary/', href: 'https://letterboxd.com/jane/diary/' },
    ])
  })

  it('splits last-four-watched into two independent links around " or "', () => {
    expect(formatUrlHintSegments('last-four-watched', 'jane')).toEqual([
      { kind: 'link', text: 'letterboxd.com/jane/',       href: 'https://letterboxd.com/jane/' },
      { kind: 'text', text: ' or ' },
      { kind: 'link', text: 'letterboxd.com/jane/films/', href: 'https://letterboxd.com/jane/films/' },
    ])
  })

  it('links the full list prefix to the lists index', () => {
    expect(formatUrlHintSegments('list', 'jane')).toEqual([
      { kind: 'link', text: 'letterboxd.com/jane/list/', href: 'https://letterboxd.com/jane/lists/' },
    ])
  })

  it('wraps the reviews URL in a link when logged in', () => {
    expect(formatUrlHintSegments('review', 'jane')).toEqual([
      { kind: 'link', text: 'letterboxd.com/jane/reviews/', href: 'https://letterboxd.com/jane/reviews/' },
    ])
  })

  it('wraps the stats URL in a link when logged in', () => {
    expect(formatUrlHintSegments('stats', 'jane')).toEqual([
      { kind: 'link', text: 'letterboxd.com/jane/stats/', href: 'https://letterboxd.com/jane/stats/' },
    ])
  })

  it('concatenates all segment text back to the full hint string', () => {
    for (const ct of CARD_TYPES) {
      const segments = formatUrlHintSegments(ct, 'jane')
      const joined = segments.map(s => s.text).join('')
      expect(joined).toBe(formatUrlHint(ct, 'jane'))
    }
  })
})

describe('CARD_TYPE_CONFIGS.hintHrefs invariants', () => {
  it('each hintHref.text appears in the corresponding urlHint at least once', () => {
    for (const ct of CARD_TYPES) {
      const cfg = CARD_TYPE_CONFIGS[ct]
      for (const href of cfg.hintHrefs ?? []) {
        expect(cfg.urlHint, `${ct}: ${href.text} not found in ${cfg.urlHint}`).toContain(href.text)
      }
    }
  })
})

// ── Stats page availability ───────────────────────────────────────────────────
// Regression cover for the empty Milestones card: /user/stats/ and
// /user/year/YYYY/ both match the `stats` urlPattern but expose different
// sections, so a category has to declare which page it lives on.
// The matrix in STATS_CATEGORY_CONFIGS was verified against live Letterboxd
// markup on an authenticated Pro account (2026-08).

const ALL_TIME = 'https://letterboxd.com/michaellamb/stats/'
const YEAR = 'https://letterboxd.com/michaellamb/year/2025/'

describe('isYearStatsUrl', () => {
  it('recognizes the Year in Review page, with or without a trailing slash', () => {
    expect(isYearStatsUrl(YEAR)).toBe(true)
    expect(isYearStatsUrl('https://letterboxd.com/michaellamb/year/2026')).toBe(true)
  })

  it('does not treat all-time stats as a year page', () => {
    expect(isYearStatsUrl(ALL_TIME)).toBe(false)
  })

  it('works on a bare pathname, which is what the content script passes', () => {
    expect(isYearStatsUrl('/michaellamb/year/2025/')).toBe(true)
    expect(isYearStatsUrl('/michaellamb/stats/')).toBe(false)
  })
})

describe('isStatsCategoryAvailable', () => {
  it('blocks the three year-only categories on the all-time page', () => {
    // These are the categories that produced a header-and-footer-only card.
    for (const cat of ['milestones', 'by-week', 'breakdown'] as StatsCategory[]) {
      expect(isStatsCategoryAvailable(cat, ALL_TIME), cat).toBe(false)
    }
  })

  it('allows every category on the Year in Review page', () => {
    for (const cat of STATS_CATEGORIES) {
      expect(isStatsCategoryAvailable(cat, YEAR), cat).toBe(true)
    }
  })

  it('allows the shared categories on the all-time page', () => {
    for (const cat of ['summary', 'most-watched', 'highest-rated', 'genres', 'countries', 'languages'] as StatsCategory[]) {
      expect(isStatsCategoryAvailable(cat, ALL_TIME), cat).toBe(true)
    }
  })
})

describe('CARD_TYPE_CONFIGS.stats urlPattern', () => {
  it('accepts both stats pages', () => {
    const { urlPattern } = CARD_TYPE_CONFIGS.stats
    expect(urlPattern.test(ALL_TIME)).toBe(true)
    expect(urlPattern.test(YEAR)).toBe(true)
  })

  it('rejects /stats/YYYY/, which 404s on Letterboxd', () => {
    // It was accepted for a while; a hint pointing there would dead-end.
    expect(CARD_TYPE_CONFIGS.stats.urlPattern.test('https://letterboxd.com/michaellamb/stats/2025/')).toBe(false)
  })
})

describe('statsCategoryUnavailableMessage', () => {
  it('names the category and points at that user’s year page', () => {
    const msg = statsCategoryUnavailableMessage('milestones', 'michaellamb', 2026)
    expect(msg).toContain('Milestones')
    expect(msg).toContain('letterboxd.com/michaellamb/year/2026/')
  })

  it('falls back to a placeholder when the username is unknown', () => {
    expect(statsCategoryUnavailableMessage('by-week', undefined, 2026))
      .toContain('letterboxd.com/your-username/year/2026/')
  })

  it('defaults to the current year, which Letterboxd publishes as "to date"', () => {
    expect(statsCategoryUnavailableMessage('breakdown', 'jane'))
      .toContain(`/year/${new Date().getFullYear()}/`)
  })
})
