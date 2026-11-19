import type { ReviewFit, ReviewField } from '../canvas/renderCard'
import { LAYOUT_CONFIGS } from '../types'

/** Button labels for the fields a Review card can drop to make room. */
export const REVIEW_FIELD_LABELS: Record<ReviewField, string> = {
  tags: 'tags', overview: 'overview', genres: 'genres', director: 'director',
  runtime: 'runtime', date: 'date', rating: 'rating', year: 'year',
}

/**
 * The sentence shown under a Review card that left reviews out or cut one off.
 * Null when every requested review is on the card, whole.
 */
export function reviewFitMessage(fit: ReviewFit | null): { lead: string; detail: string } | null {
  if (!fit || fit.requested === 0) return null
  const layoutLabel = LAYOUT_CONFIGS[fit.layout].label
  if (fit.clipped) {
    return {
      lead: fit.requested === 1 ? 'This review is cut off.' : `Showing 1 of ${fit.requested} reviews, cut off.`,
      detail: `It is too long for ${layoutLabel}.`,
    }
  }
  if (fit.shown >= fit.requested) return null
  const missing = fit.requested - fit.shown
  return {
    lead: `Showing ${fit.shown} of ${fit.requested} reviews.`,
    detail: `The other ${missing === 1 ? 'one doesn’t' : `${missing} don’t`} fit on ${layoutLabel}.`,
  }
}

/** True when the notice has at least one change to offer. */
export function reviewFitHasFixes(fit: ReviewFit): boolean {
  return fit.fittingLayouts.length > 0 || fit.hideableFields.length > 0
}
