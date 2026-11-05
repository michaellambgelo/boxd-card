import type { CardType } from './types'

export interface AltTextFilm {
  title: string
  year: string
  rating: string
  date?: string
  reviewText?: string
  tags?: string[]
  director?: string
  runtime?: number
  genres?: string[]
  overview?: string
}

export interface AltTextInput {
  films: AltTextFilm[]
  username: string
  cardType: CardType
  showTitle: boolean
  showYear: boolean
  showRating: boolean
  showDate: boolean
  showCardTypeLabel?: boolean
  cardTypeLabel?: string
  showListTitle?: boolean
  listTitle?: string
  showListDescription?: boolean
  listDescription?: string
  showTags?: boolean
  listTags?: string[]
  showDirector?: boolean
  showRuntime?: boolean
  showGenres?: boolean
  showOverview?: boolean
}

export function generateAltText(input: AltTextInput): string {
  const { films, username, cardType } = input

  if (!films.length) return `Boxd Card by ${username}`

  // Build opening line
  let opening: string
  if (cardType === 'review') {
    opening = `Boxd Card: review by ${username}`
  } else if (cardType === 'list') {
    if (input.showListTitle && input.listTitle) {
      opening = `Boxd Card: ${input.listTitle} by ${username}`
    } else {
      opening = `Boxd Card: list by ${username}`
    }
  } else if (input.showCardTypeLabel && input.cardTypeLabel) {
    opening = `Boxd Card: ${username}'s ${input.cardTypeLabel}`
  } else {
    opening = `Boxd Card by ${username}`
  }

  // List description
  if (cardType === 'list' && input.showListDescription && input.listDescription) {
    opening += ` — ${input.listDescription}`
  }

  // List tags
  if (cardType === 'list' && input.showTags && input.listTags?.length) {
    opening += `. Tags: ${input.listTags.join(', ')}`
  }

  // Build film entries
  const isReview = cardType === 'review'
  const entries = films.map(f => {
    // Each film is one line of " | "-separated fields.
    const fields: string[] = []

    if (input.showTitle) {
      let titlePart = f.title
      if (input.showYear && f.year) titlePart += ` (${f.year})`
      fields.push(titlePart)
    }

    if (input.showRating && f.rating) fields.push(f.rating)
    if (isReview && input.showRuntime && f.runtime) fields.push(`${f.runtime} min`)
    if (isReview && input.showDirector && f.director) fields.push(`directed by ${f.director}`)
    if (input.showDate && f.date) fields.push(f.date)
    if (isReview && input.showTags && f.tags?.length) fields.push(`tags: ${f.tags.join(', ')}`)
    if (isReview && input.showGenres && f.genres?.length) fields.push(`genres: ${f.genres.join(', ')}`)
    if (isReview && input.showOverview && f.overview) fields.push(`synopsis: ${f.overview}`)
    if (isReview && f.reviewText) fields.push('includes a review')

    return fields.join(' | ')
  })

  // Heading on the first line, then one film per line. Films also end in " |"
  // so they stay separated on sites that strip newlines from alt text.
  return `${opening}\n${entries.join(' |\n')}`
}
