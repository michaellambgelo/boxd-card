import { describe, it, expect } from 'vitest'
import { HERO_CARDS, HERO_USERNAME, heroCardOptions, heroPosterUrl } from './heroCards'

describe('hero cards', () => {
  it('fills both slots of the About page card stack exactly once', () => {
    expect(HERO_CARDS.map((c) => c.slot).sort()).toEqual(['back', 'front'])
  })

  it('shows four films per card, like the product does for these types', () => {
    for (const card of HERO_CARDS) expect(card.films).toHaveLength(4)
  })

  it('never shows ratings on Favorites, which Letterboxd does not expose', () => {
    const fav = HERO_CARDS.find((c) => c.cardType === 'favorites')!
    expect(fav.films.every((f) => f.rating === '')).toBe(true)
    expect(heroCardOptions(fav, []).showRating).toBe(false)
  })

  it('maps posters by index and leaves a missing one empty for the placeholder', () => {
    const card = HERO_CARDS[0]
    const opts = heroCardOptions(card, ['data:a', 'data:b'])
    expect(opts.films.map((f) => f.posterDataUrl)).toEqual(['data:a', 'data:b', '', ''])
    expect(opts.username).toBe(HERO_USERNAME)
    expect(opts.showShareIcon).toBe(false)
    expect(opts.layout).toBe('landscape')
  })

  it('points posters at TMDB, which serves them with CORS so the canvas can export', () => {
    for (const card of HERO_CARDS) {
      for (const film of card.films) {
        expect(heroPosterUrl(film)).toMatch(/^https:\/\/image\.tmdb\.org\/t\/p\/w342\/\w+\.jpg$/)
      }
    }
  })
})
