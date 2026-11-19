import { describe, it, expect } from 'vitest'
import { reviewFitMessage, reviewFitHasFixes } from './reviewFit'
import type { ReviewFit } from '../canvas/renderCard'

const fit = (over: Partial<ReviewFit>): ReviewFit => ({
  layout: 'banner', requested: 4, shown: 4, clipped: false, fittingLayouts: [], hideableFields: [], ...over,
})

describe('reviewFitMessage', () => {
  it('says nothing when every review is on the card', () => {
    expect(reviewFitMessage(null)).toBeNull()
    expect(reviewFitMessage(fit({}))).toBeNull()
    expect(reviewFitMessage(fit({ requested: 0, shown: 0 }))).toBeNull()
  })

  it('counts the reviews left out and names the layout', () => {
    expect(reviewFitMessage(fit({ shown: 2 }))).toEqual({
      lead: 'Showing 2 of 4 reviews.', detail: 'The other 2 don’t fit on Banner.',
    })
    expect(reviewFitMessage(fit({ shown: 3, layout: 'story' }))).toEqual({
      lead: 'Showing 3 of 4 reviews.', detail: 'The other one doesn’t fit on Story.',
    })
  })

  it('says a clipped review is cut off', () => {
    expect(reviewFitMessage(fit({ requested: 1, shown: 1, clipped: true }))).toEqual({
      lead: 'This review is cut off.', detail: 'It is too long for Banner.',
    })
    expect(reviewFitMessage(fit({ requested: 3, shown: 1, clipped: true }))?.lead)
      .toBe('Showing 1 of 3 reviews, cut off.')
  })
})

describe('reviewFitHasFixes', () => {
  it('is true only when there is a layout or a field to offer', () => {
    expect(reviewFitHasFixes(fit({}))).toBe(false)
    expect(reviewFitHasFixes(fit({ fittingLayouts: ['landscape'] }))).toBe(true)
    expect(reviewFitHasFixes(fit({ hideableFields: ['tags'] }))).toBe(true)
  })
})
