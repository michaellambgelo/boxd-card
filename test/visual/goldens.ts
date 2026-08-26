// The golden set.
//
// Keyed to DRAW PATH, not card type. All four poster-grid card types funnel
// through the same renderCard path, so a golden per card type would be largely
// redundant while leaving the stats renderers — more than half the font sites —
// completely unguarded. Stats is Pro-only and extension-only, which is exactly
// why it is the easy half to forget.
//
// Font-site distribution across renderCard.ts:
//   renderCard 17 · renderBreakdownCard 6 · renderByWeekChart 4 ·
//   renderMilestonesCard 3 · renderBarChartCard 3 · measureReviewRows 2 ·
//   drawStatsHeader 2 · renderStatsSummary 2 · drawFooter 2 · wrapText 1 ·
//   drawTagPills 1
//
// drawFooter comes free with every one of them.
//
// These pin 40 reachable font sites. The other three lived in layout.sideLayout's
// true-arm, which was unreachable — the flag was constructed false everywhere and
// never assigned true — and has since been deleted.
import type { CardOptions } from '../../src/canvas/renderCard'
import { cardOptionsFor } from './fixtures'

export interface Golden {
  name: string
  /** Which draw path this golden exists to pin. */
  pins: string
  options: CardOptions
}

export const GOLDENS: Golden[] = [
  {
    name: 'grid-4-films',
    pins: 'renderCard, <=4 branch (single centered row)',
    options: cardOptionsFor('last-four-watched', 'landscape'),
  },
  {
    name: 'grid-10-films',
    pins: 'renderCard, >4 branch — GRID_META_FS / GRID_DATE_FS, 5-col math',
    options: cardOptionsFor('recent-diary', 'landscape', { listCount: 10 }),
  },
  {
    name: 'grid-20-films',
    pins: 'renderCard, grid wrapping at the largest ListCount',
    options: cardOptionsFor('recent-diary', 'landscape', { listCount: 20 }),
  },
  {
    name: 'review-side-by-side',
    pins: 'measureReviewRows + cfg.titleFs/metaFs/reviewFs (dynamic height)',
    options: { ...cardOptionsFor('review', 'landscape'), reviewCount: 2 },
  },
  {
    name: 'review-stacked',
    pins: 'measureReviewRows stacked branch + the fixed-height row drop',
    options: { ...cardOptionsFor('review', 'story'), reviewCount: 4 },
  },
  {
    name: 'list-tags-long-title',
    pins: 'drawTagPills TAG_FONT + wrapText + list title/description',
    options: cardOptionsFor('list', 'landscape', { listCount: 10 }),
  },
  {
    name: 'stats-summary',
    pins: 'renderStatsSummary + drawStatsHeader',
    options: cardOptionsFor('stats', 'landscape', { statsCategory: 'summary' }),
  },
  {
    name: 'stats-by-week',
    pins: 'renderByWeekChart',
    options: cardOptionsFor('stats', 'landscape', { statsCategory: 'by-week' }),
  },
  {
    name: 'stats-breakdown',
    pins: 'renderBreakdownCard',
    options: cardOptionsFor('stats', 'landscape', { statsCategory: 'breakdown' }),
  },
  {
    name: 'stats-bar-chart',
    pins: 'renderBarChartCard',
    options: cardOptionsFor('stats', 'landscape', { statsCategory: 'genres' }),
  },
  {
    name: 'stats-milestones',
    pins: 'renderMilestonesCard + milestoneGrid',
    options: cardOptionsFor('stats', 'landscape', { statsCategory: 'milestones' }),
  },
]
