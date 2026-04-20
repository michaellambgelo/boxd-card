import { describe, it, expect } from 'vitest'
import { formatUrlHint, formatUrlHintSegments, CARD_TYPE_CONFIGS, CARD_TYPES } from './types'

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
