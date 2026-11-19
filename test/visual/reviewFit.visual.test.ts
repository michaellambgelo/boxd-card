import { describe, it, expect } from 'vitest'
import { cardOptionsFor } from './fixtures'
import { renderToBuffer } from './harness'
import { measureReviewFit } from '../../src/canvas/renderCard'
import type { CardOptions, ReviewField } from '../../src/canvas/renderCard'

// measureReviewFit is what lets a surface say "Showing 2 of 4 reviews" and
// offer only the changes that would fit them all. Every claim it makes is
// checked here against the renderer or against a second measurement, so a
// button in the notice can never lead to another card with reviews missing.

const FIELD_OPTION: Record<ReviewField, keyof CardOptions> = {
  tags: 'showTags', overview: 'showOverview', genres: 'showGenres', director: 'showDirector',
  runtime: 'showRuntime', date: 'showDate', rating: 'showRating', year: 'showYear',
}

const banner4 = (): CardOptions => ({ ...cardOptionsFor('review', 'banner'), reviewCount: 4 })

describe('measureReviewFit', () => {
  it('returns null for cards that are not reviews', async () => {
    expect(await measureReviewFit(cardOptionsFor('recent-diary', 'banner'))).toBeNull()
  })

  it('reports nothing left out on landscape, which grows to fit', async () => {
    const fit = await measureReviewFit({ ...cardOptionsFor('review', 'landscape'), reviewCount: 4 })
    expect(fit).toMatchObject({ requested: 4, shown: 4, clipped: false, fittingLayouts: [], hideableFields: [] })
  })

  it('reports the reviews a banner leaves out, and matches what is drawn', async () => {
    const fit = (await measureReviewFit(banner4()))!
    expect(fit.requested).toBe(4)
    expect(fit.shown).toBeGreaterThan(0)
    expect(fit.shown).toBeLessThan(4)
    expect(fit.clipped).toBe(false)
    // The report and the card must agree: asking for `shown` draws the same PNG.
    const asked = await renderToBuffer(banner4())
    const shown = await renderToBuffer({ ...banner4(), reviewCount: fit.shown as 1 | 2 | 3 })
    expect(asked.equals(shown)).toBe(true)
  }, 60_000)

  it('only offers layouts on which every requested review fits', async () => {
    const fit = (await measureReviewFit(banner4()))!
    expect(fit.fittingLayouts).toContain('landscape')
    expect(fit.fittingLayouts).not.toContain('banner')
    for (const layout of fit.fittingLayouts) {
      const there = (await measureReviewFit({ ...banner4(), layout }))!
      expect(there).toMatchObject({ requested: 4, shown: 4, clipped: false })
    }
  })

  it('offers hiding a field when that alone fits every review, and only then', async () => {
    // Story fits one of two fixture reviews; the first carries five tag pills,
    // and dropping tags alone makes room for the second.
    const story2: CardOptions = { ...cardOptionsFor('review', 'story'), reviewCount: 2 }
    const storyFit = (await measureReviewFit(story2))!
    expect(storyFit).toMatchObject({ requested: 2, shown: 1 })
    expect(storyFit.hideableFields).toEqual(['tags'])

    // Every offer anywhere in the matrix is checked by measuring with it applied.
    let offers = 0
    for (const layout of ['banner', 'square', '4:5', '3:4', 'story'] as const) {
      for (const reviewCount of [2, 3, 4] as const) {
        const options: CardOptions = { ...cardOptionsFor('review', layout), reviewCount }
        const fit = (await measureReviewFit(options))!
        for (const field of fit.hideableFields) {
          offers++
          expect(options[FIELD_OPTION[field]]).toBe(true)
          const hidden = (await measureReviewFit({ ...options, [FIELD_OPTION[field]]: false }))!
          expect(hidden).toMatchObject({ requested: reviewCount, shown: reviewCount, clipped: false })
        }
      }
    }
    expect(offers).toBeGreaterThan(1)

    // No single field is enough for four reviews on a banner, so none is offered;
    // and a field that is already off (TMDB fields in the fixture) never is.
    expect((await measureReviewFit(banner4()))!.hideableFields).toEqual([])
  })

  it('flags a single review too long for the layout as clipped', async () => {
    const base = cardOptionsFor('review', 'banner')
    const long = { ...base.films[0], reviewText: 'An exhausting, luminous, impossible film. '.repeat(120) }
    const fit = (await measureReviewFit({ ...base, films: [long], reviewCount: 1 }))!
    expect(fit).toMatchObject({ requested: 1, shown: 1, clipped: true })
    expect(fit.fittingLayouts).toContain('landscape')
  })
})
