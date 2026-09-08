import { describe, it, expect } from 'vitest'
import {
  resolveLazyPoster,
  filmSlugFromLazyPoster,
  filmIdFromLazyPoster,
  isCustomPoster,
  posterUrlFromLazyPoster,
} from './lazyPoster'

const PLACEHOLDER_SRC = 'https://s.ltrbxd.com/static/img/empty-poster-150-DtnLDE3k.png'

/** Build a bare LazyPoster element from a map of attributes. */
function lazyPoster(attrs: Record<string, string>): Element {
  const doc = new DOMParser().parseFromString('<div id="root"></div>', 'text/html')
  const el = doc.createElement('div')
  el.setAttribute('data-component-class', 'LazyPoster')
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
  return el
}

describe('resolveLazyPoster — the rung ladder', () => {
  it('rung 0: a resolved img.src wins over every attribute', () => {
    // Extension-only: this is the ONLY rung that reflects a per-entry custom
    // poster, so it must outrank the reconstructed path.
    const el = lazyPoster({ 'data-item-slug': 'dune-2021' })
    const r = resolveLazyPoster(el, 'https://a.ltrbxd.com/resized/film-poster/x-0-460-0-690-crop.jpg')
    expect(r.posterUrl).toBe('https://a.ltrbxd.com/resized/film-poster/x-0-460-0-690-crop.jpg')
    expect(r.rung).toBe('img-src')
    // The slug still comes from the attributes, so TMDB lookups survive.
    expect(r.filmSlug).toBe('dune-2021')
  })

  it('rung 0 is skipped when img.src is still the empty-poster placeholder', () => {
    const el = lazyPoster({ 'data-item-slug': 'dune-2021' })
    const r = resolveLazyPoster(el, PLACEHOLDER_SRC)
    expect(r.posterUrl).toBe('https://letterboxd.com/film/dune-2021/image-150/')
    expect(r.rung).toBe('data-item-slug')
  })

  it('rung 1: data-poster-url is kept verbatim when present', () => {
    const el = lazyPoster({
      'data-poster-url': '/film/dune-2021/image-999/',
      'data-item-link': '/film/dune-2021/',
    })
    const r = resolveLazyPoster(el)
    expect(r.posterUrl).toBe('https://letterboxd.com/film/dune-2021/image-999/')
    expect(r.rung).toBe('data-poster-url')
  })

  it('rung 2: reconstructs from data-item-link', () => {
    const r = resolveLazyPoster(lazyPoster({ 'data-item-link': '/film/high-and-low/' }))
    expect(r.posterUrl).toBe('https://letterboxd.com/film/high-and-low/image-150/')
    expect(r.filmSlug).toBe('high-and-low')
    expect(r.rung).toBe('data-item-link')
  })

  it('rung 3: reconstructs from data-item-slug', () => {
    const r = resolveLazyPoster(lazyPoster({ 'data-item-slug': 'burning-2018' }))
    expect(r.posterUrl).toBe('https://letterboxd.com/film/burning-2018/image-150/')
    expect(r.rung).toBe('data-item-slug')
  })

  it('rung 4: reconstructs from posteredBaseLink in data-resolvable-poster-path', () => {
    const r = resolveLazyPoster(lazyPoster({
      'data-resolvable-poster-path': JSON.stringify({
        postered: { uid: 'film:44542' },
        posteredBaseLink: '/film/harakiri/',
      }),
    }))
    expect(r.posterUrl).toBe('https://letterboxd.com/film/harakiri/image-150/')
    expect(r.rung).toBe('postered-base-link')
  })

  it('returns empty with rung "none" when no attribute yields a slug', () => {
    const r = resolveLazyPoster(lazyPoster({ 'data-item-name': 'Some Film (2024)' }))
    expect(r).toEqual({ posterUrl: '', filmSlug: '', rung: 'none' })
  })

  it('returns empty for a null element rather than throwing', () => {
    expect(resolveLazyPoster(null)).toEqual({ posterUrl: '', filmSlug: '', rung: 'none' })
  })

  it('always emits a trailing slash — fetchImageDataUrl anchors its regex on it', () => {
    // /film/<slug>/image-150/ is a TOKEN, not a fetchable URL: requesting it
    // through the proxy returns 403. It works only because fetchImageDataUrl
    // intercepts this exact shape, and that regex ends in `\/$`.
    const interception = /letterboxd\.com\/film\/([^/]+)\/image-\d+\/$/
    const cases: Record<string, string>[] = [
      { 'data-item-link': '/film/dune-2021/' },
      { 'data-item-slug': 'dune-2021' },
      { 'data-poster-url': '/film/dune-2021/image-150/' },
    ]
    for (const attrs of cases) {
      expect(posterUrlFromLazyPoster(lazyPoster(attrs))).toMatch(interception)
    }
  })
})

describe('filmSlugFromLazyPoster — validation', () => {
  it('falls through a non-film item-link instead of building a URL that 403s', () => {
    // A future /tv/ or /list/ entry must not produce /film/<garbage>/image-150/.
    const el = lazyPoster({
      'data-item-link': '/list/some-list/',
      'data-item-slug': 'real-film-2024',
    })
    expect(filmSlugFromLazyPoster(el)).toBe('real-film-2024')
  })

  it('rejects a malformed data-item-slug', () => {
    expect(filmSlugFromLazyPoster(lazyPoster({ 'data-item-slug': 'Not A Slug!' }))).toBe('')
  })

  it('survives malformed JSON in data-resolvable-poster-path', () => {
    const el = lazyPoster({ 'data-resolvable-poster-path': '{not json' })
    expect(() => filmSlugFromLazyPoster(el)).not.toThrow()
    expect(filmSlugFromLazyPoster(el)).toBe('')
  })

  it('reads the slug from attributes, not from a resolved CDN URL', () => {
    // A resolved poster is a.ltrbxd.com/resized/film-poster/..., which contains
    // /film-poster/ rather than /film/ and yields '' from slugFromPosterUrl.
    // Reading structured attributes is what keeps TMDB working post-hydration.
    const el = lazyPoster({ 'data-item-link': '/film/mulholland-drive/' })
    const r = resolveLazyPoster(el, 'https://a.ltrbxd.com/resized/film-poster/1/2/3/x-0-460-0-690-crop.jpg')
    expect(r.filmSlug).toBe('mulholland-drive')
  })
})

describe('filmIdFromLazyPoster', () => {
  it('prefers the legacy data-film-id when present', () => {
    expect(filmIdFromLazyPoster(lazyPoster({
      'data-film-id': '123',
      'data-postered-identifier': JSON.stringify({ uid: 'film:999' }),
    }))).toBe('123')
  })

  it('parses the uid out of data-postered-identifier', () => {
    expect(filmIdFromLazyPoster(lazyPoster({
      'data-postered-identifier': JSON.stringify({ lid: '1RSc', uid: 'film:44542', type: 'film' }),
    }))).toBe('44542')
  })

  it('falls back to postered.uid in data-resolvable-poster-path', () => {
    expect(filmIdFromLazyPoster(lazyPoster({
      'data-resolvable-poster-path': JSON.stringify({ postered: { uid: 'film:51171' } }),
    }))).toBe('51171')
  })

  it('returns empty rather than throwing on malformed JSON', () => {
    expect(filmIdFromLazyPoster(lazyPoster({ 'data-postered-identifier': '{{' }))).toBe('')
  })
})

describe('isCustomPoster', () => {
  it('is true when preferredAlternativePosterId is present', () => {
    expect(isCustomPoster(lazyPoster({
      'data-resolvable-poster-path': JSON.stringify({
        preferredAlternativePosterId: '143',
        postered: { uid: 'film:51171' },
      }),
    }))).toBe(true)
  })

  it('is false for a default poster, even though hasDefaultPoster is true', () => {
    // hasDefaultPoster describes the film, not what is on screen — it is not a
    // substitute for this check.
    expect(isCustomPoster(lazyPoster({
      'data-resolvable-poster-path': JSON.stringify({
        postered: { uid: 'film:51171' },
        hasDefaultPoster: true,
      }),
    }))).toBe(false)
  })
})
