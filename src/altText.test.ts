import { describe, it, expect } from 'vitest'
import { generateAltText, AltTextInput } from './altText'

function base(overrides: Partial<AltTextInput> = {}): AltTextInput {
  return {
    films: [
      { title: 'Dune', year: '2021', rating: '★★★★' },
      { title: 'The Matrix', year: '1999', rating: '★★★★★' },
    ],
    username: 'testuser',
    cardType: 'last-four-watched',
    showTitle: true,
    showYear: true,
    showRating: true,
    showDate: true,
    showCardTypeLabel: true,
    cardTypeLabel: 'Last Four Watched',
    ...overrides,
  }
}

describe('generateAltText', () => {
  it('returns fallback for empty films array', () => {
    expect(generateAltText(base({ films: [] }))).toBe('Boxd Card by testuser')
  })

  // Opening line per card type
  it('uses card type label for grid cards', () => {
    const result = generateAltText(base())
    expect(result).toMatch(/^Boxd Card: testuser's Last Four Watched/)
  })

  it('uses Favorites label', () => {
    const result = generateAltText(base({ cardType: 'favorites', cardTypeLabel: 'Favorites' }))
    expect(result).toMatch(/^Boxd Card: testuser's Favorites/)
  })

  it('uses list title for list cards', () => {
    const result = generateAltText(base({
      cardType: 'list',
      showListTitle: true,
      listTitle: 'Best of 2025',
    }))
    expect(result).toMatch(/^Boxd Card: Best of 2025 by testuser/)
  })

  it('falls back to generic list opening when title hidden', () => {
    const result = generateAltText(base({
      cardType: 'list',
      showListTitle: false,
    }))
    expect(result).toMatch(/^Boxd Card: list by testuser/)
  })

  it('uses review opening for review cards', () => {
    const result = generateAltText(base({ cardType: 'review' }))
    expect(result).toMatch(/^Boxd Card: review by testuser/)
  })

  it('falls back when card type label is hidden', () => {
    const result = generateAltText(base({ showCardTypeLabel: false }))
    expect(result).toMatch(/^Boxd Card by testuser/)
  })

  // Film entries
  it('includes title and year', () => {
    const result = generateAltText(base())
    expect(result).toContain('Dune (2021)')
    expect(result).toContain('The Matrix (1999)')
  })

  it('omits year when showYear is false', () => {
    const result = generateAltText(base({ showYear: false }))
    expect(result).toContain('Dune ★★★★')
    expect(result).not.toContain('(2021)')
  })

  it('omits rating when showRating is false', () => {
    const result = generateAltText(base({ showRating: false }))
    expect(result).toContain('Dune (2021)')
    expect(result).not.toContain('★★★★')
  })

  it('omits title when showTitle is false', () => {
    const result = generateAltText(base({ showTitle: false }))
    expect(result).not.toContain('Dune')
    // Should still include rating
    expect(result).toContain('★★★★')
  })

  // Date
  it('includes watch date for diary entries', () => {
    const result = generateAltText(base({
      cardType: 'recent-diary',
      cardTypeLabel: 'Recent Diary',
      films: [{ title: 'Dune', year: '2021', rating: '★★★★', date: 'Mar 20, 2026' }],
    }))
    expect(result).toContain('watched Mar 20, 2026')
  })

  it('omits date when showDate is false', () => {
    const result = generateAltText(base({
      cardType: 'recent-diary',
      cardTypeLabel: 'Recent Diary',
      showDate: false,
      films: [{ title: 'Dune', year: '2021', rating: '★★★★', date: 'Mar 20, 2026' }],
    }))
    expect(result).not.toContain('watched')
  })

  // Review-specific
  it('indicates review presence for review cards', () => {
    const result = generateAltText(base({
      cardType: 'review',
      films: [{ title: 'Groundhog Day', year: '1993', rating: '★★★★★', reviewText: 'Amazing film.' }],
    }))
    expect(result).toContain('includes a review')
    expect(result).not.toContain('Amazing film')
  })

  it('does not indicate review when reviewText is absent', () => {
    const result = generateAltText(base({
      cardType: 'review',
      films: [{ title: 'Groundhog Day', year: '1993', rating: '★★★★★' }],
    }))
    expect(result).not.toContain('includes a review')
  })

  it('includes tags for review cards', () => {
    const result = generateAltText(base({
      cardType: 'review',
      showTags: true,
      films: [{ title: 'Dune', year: '2021', rating: '★★★★', tags: ['sci-fi', 'epic'] }],
    }))
    expect(result).toContain('[tags: sci-fi, epic]')
  })

  it('omits tags when showTags is false', () => {
    const result = generateAltText(base({
      cardType: 'review',
      showTags: false,
      films: [{ title: 'Dune', year: '2021', rating: '★★★★', tags: ['sci-fi'] }],
    }))
    expect(result).not.toContain('[tags:')
  })

  // List metadata
  it('includes list description', () => {
    const result = generateAltText(base({
      cardType: 'list',
      showListTitle: true,
      listTitle: 'Best of 2025',
      showListDescription: true,
      listDescription: 'My top picks this year.',
    }))
    expect(result).toContain('Best of 2025 by testuser — My top picks this year.')
  })

  it('includes list tags', () => {
    const result = generateAltText(base({
      cardType: 'list',
      showListTitle: true,
      listTitle: 'Best of 2025',
      showTags: true,
      listTags: ['ranked', '2025'],
    }))
    expect(result).toContain('Tags: ranked, 2025')
  })

  // Separator
  it('joins grid films with comma', () => {
    const result = generateAltText(base())
    // Films joined by ", " not ". "
    expect(result).toContain('Dune (2021) ★★★★, The Matrix (1999) ★★★★★')
  })

  it('joins review films with period', () => {
    const result = generateAltText(base({
      cardType: 'review',
      films: [
        { title: 'Film A', year: '2020', rating: '★★★' },
        { title: 'Film B', year: '2021', rating: '★★★★' },
      ],
    }))
    expect(result).toContain('Film A (2020) ★★★. Film B (2021) ★★★★')
  })
})
