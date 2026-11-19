import { describe, it, expect } from 'vitest'
import { gridFitMessage } from './gridFit'

describe('gridFitMessage', () => {
  it('is null when nothing was hidden', () => {
    expect(gridFitMessage(null)).toBeNull()
    expect(gridFitMessage({ layout: '4:5', filmCount: 20, hiddenFields: [], fittingLayouts: [] })).toBeNull()
  })

  it('names the hidden fields, the film count and the layout', () => {
    const msg = gridFitMessage({
      layout: '4:5', filmCount: 20, hiddenFields: ['title', 'year', 'date'], fittingLayouts: ['landscape'],
    })
    expect(msg).toEqual({
      lead: 'Titles, years and dates are left off.',
      detail: '20 films only fit on 4:5 as posters.',
    })
  })

  it('reads naturally with a single field', () => {
    const msg = gridFitMessage({ layout: 'square', filmCount: 10, hiddenFields: ['title'], fittingLayouts: [] })
    expect(msg?.lead).toBe('Titles are left off.')
  })
})
