import { describe, it, expect } from 'vitest'
import { cardOptionsFor } from './fixtures'
import { renderToBuffer, pngSize } from './harness'
import type { Layout, ReviewCount } from '../../src/types'

// Review cards on fixed-height layouts used to draw rows that could not fit and
// rely on the clip, producing a review cut off mid-sentence with the footer
// painted over the remains. measureReviewRows now drops rows that do not fit.
//
// The tell is simple: if only one row fits, asking for four must render exactly
// what asking for one renders. Before the fix these differed, because the extra
// rows were drawn and then clipped.
const FIXED_HEIGHT_LAYOUTS: Layout[] = ['banner', 'square', '4:5', '3:4', 'story']

describe('review overflow', () => {
  it.each(FIXED_HEIGHT_LAYOUTS)('keeps %s at its declared height regardless of review count', async (layout) => {
    const counts: ReviewCount[] = [1, 2, 3, 4]
    const sizes = await Promise.all(counts.map(async (reviewCount) => {
      const buf = await renderToBuffer({ ...cardOptionsFor('review', layout), reviewCount })
      return pngSize(buf)
    }))
    // A fixed-height layout is a platform size; content must never grow it.
    for (const s of sizes) expect(s).toEqual(sizes[0])
  }, 60_000)

  it('renders only whole rows on banner, so count 4 matches count 1', async () => {
    const one = await renderToBuffer({ ...cardOptionsFor('review', 'banner'), reviewCount: 1 })
    const four = await renderToBuffer({ ...cardOptionsFor('review', 'banner'), reviewCount: 4 })
    // Only one review row fits in 750px with this fixture content. If a partial
    // second row were drawn again, these would diverge.
    expect(four.equals(one)).toBe(true)
  }, 60_000)
})
