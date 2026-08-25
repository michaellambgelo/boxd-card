/**
 * The card type scale.
 *
 * Font sizes used to be literals scattered through renderCard.ts — forty-odd
 * `ctx.font = '22px sans-serif'` strings plus a handful of arithmetic
 * expressions, with no way to see the scale as a whole or change it coherently.
 * This is the same move ReviewLayoutConfig already made for review cards
 * (renderCard.ts), generalised to grid cards, stats and milestones.
 *
 * Values here are exactly what the literals were. Introducing this file changed
 * no rendering, which is what the golden suite exists to prove.
 *
 * Review cards are deliberately NOT here: their sizes vary per layout and are
 * already data, carried by reviewLayoutConfig(). Duplicating them would create
 * the second source of truth this file exists to remove.
 */
import { CARD_FONT_STACK } from './fonts'

export type FontStyle = 'normal' | 'bold' | 'italic'

/**
 * Compose a canvas font string. Every draw site goes through here, so the family
 * is named in exactly one place and cannot drift back to a bare `sans-serif`.
 */
export function cardFont(px: number, style: FontStyle = 'normal'): string {
  const prefix = style === 'normal' ? '' : `${style} `
  return `${prefix}${px}px ${CARD_FONT_STACK}`
}

export const TYPE_SCALE = {
  /** Header line above every card. */
  headerDate: 30,

  /** Poster-grid card text, under each poster. */
  gridTitle: 24,
  gridMeta: 24,
  gridDate: 21,

  /** List header — title, description, and the card-type label that reuses it. */
  listTitle: 36,
  listDescription: 19,
  cardTypeLabel: 36,
  /** Tag pills, on list and review cards. */
  tag: 28,

  /** Stats header, shared by every stats render mode. */
  statsTitle: 48,
  statsSubtitle: 28,

  /** Stats: summary grid. */
  statsSummaryValue: 56,
  statsSummaryLabel: 24,

  /** Stats: films-by-week chart. */
  byWeekAxis: 20,
  byWeekTotal: 40,
  byWeekTotalLabel: 22,
  byWeekTick: 18,

  /** Stats: ratings and breakdown. */
  breakdownSectionLabel: 20,
  breakdownPieCenter: 16,
  breakdownLegend: 20,
  breakdownSpreadTick: 14,
  breakdownSpreadCount: 14,
  breakdownWatchlist: 22,

  /** Stats: genres / countries / languages bar chart. */
  barChartHeading: 30,
  barChartLabel: 22,
  barChartCount: 22,

  /** Stats: milestones. */
  milestoneHeading: 32,
  milestoneLabel: 20,
  milestoneMeta: 20,

  /** Footer, on every card. */
  footerUsername: 27,
  footerAttribution: 23,
} as const

export type TypeScaleKey = keyof typeof TYPE_SCALE
