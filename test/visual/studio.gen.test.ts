// The card studio — boxd-card's analogue of letterboxd-graphics' `npm run edit`.
//
//   npm run studio
//
// Renders every card type x layout the product actually offers into
// studio-out/, plus one contact sheet, so a design change is one command and
// one glance. Driven from CARD_TYPE_CONFIGS / LAYOUTS / STATS_CATEGORY_CONFIGS
// rather than a hand-written list, so a new card type or stats category shows
// up here automatically instead of being quietly missed.
//
// It lives in the `generate` vitest project, so `npm run test:run` does not run
// it and CI never writes files.
import { describe, it } from 'vitest'
import {
  CARD_TYPES, LAYOUTS, CARD_TYPE_CONFIGS,
  STATS_CATEGORY_CONFIGS, isStatsCategoryAvailable,
} from '../../src/types'
import type { StatsCategory } from '../../src/types'
import { cardOptionsFor } from './fixtures'
import { contactSheet, renderNamed, writeFile } from './harness'
import type { RenderedCard } from './harness'

const OUT = 'studio-out'

// The Year in Review URL, because three stats categories exist only there and
// isStatsCategoryAvailable() is the single check that knows it. Using the real
// predicate means the sheet can never render a combination the product refuses.
const YEAR_URL = 'https://letterboxd.com/michaellamb/year/2026/'

const STATS_CATEGORIES = Object.keys(STATS_CATEGORY_CONFIGS) as StatsCategory[]

interface Cell {
  name: string
  render: () => Promise<RenderedCard>
}

function matrix(): Cell[] {
  const cells: Cell[] = []

  for (const cardType of CARD_TYPES) {
    for (const layout of LAYOUTS) {
      if (cardType === 'stats') {
        for (const statsCategory of STATS_CATEGORIES) {
          const cfg = STATS_CATEGORY_CONFIGS[statsCategory]
          // Honour the product's own availability rules rather than guessing.
          if (!cfg.implemented) continue
          if (!isStatsCategoryAvailable(statsCategory, YEAR_URL)) continue
          const name = `stats-${statsCategory}-${layout}`
          cells.push({
            name,
            render: () => renderNamed(name, cardOptionsFor(cardType, layout, { statsCategory })),
          })
        }
        continue
      }

      // The <=4 vs >4 grid branch is the one ListCount boundary that changes a
      // layout decision, so cover both where the product offers a count.
      const counts: (4 | 10)[] = (cardType === 'list' || cardType === 'recent-diary') ? [4, 10] : [4]
      for (const listCount of counts) {
        const suffix = counts.length > 1 ? `-n${listCount}` : ''
        const name = `${cardType}${suffix}-${layout}`
        cells.push({
          name,
          render: () => renderNamed(name, cardOptionsFor(cardType, layout, { listCount })),
        })
      }
    }
  }

  return cells
}

describe('card studio', () => {
  it('renders every card type x layout and a contact sheet', async () => {
    const cells = matrix()
    const rendered: RenderedCard[] = []
    const failures: string[] = []

    for (const cell of cells) {
      try {
        const card = await cell.render()
        writeFile(`${OUT}/${card.name}.png`, card.buffer)
        rendered.push(card)
      } catch (err) {
        // Collect rather than throw: one broken combination should not hide the
        // other ninety. The summary at the end names every failure.
        failures.push(`${cell.name}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    const sheet = await contactSheet(rendered)
    writeFile(`${OUT}/_contact-sheet.png`, sheet)

    const lines = [
      `rendered ${rendered.length}/${cells.length} cards -> ${OUT}/`,
      `contact sheet -> ${OUT}/_contact-sheet.png`,
      ...(failures.length ? ['', `FAILED (${failures.length}):`, ...failures.map((f) => `  ${f}`)] : []),
      '',
      'card types: ' + CARD_TYPES.map((t) => CARD_TYPE_CONFIGS[t].label).join(', '),
    ]
    writeFile(`${OUT}/_summary.txt`, Buffer.from(lines.join('\n') + '\n', 'utf8'))

    // Surface failures loudly. A studio that silently skips broken cards is
    // worse than no studio: it looks like everything renders.
    if (failures.length) {
      throw new Error(`${failures.length} card(s) failed to render:\n${failures.join('\n')}`)
    }
  }, 300_000)
})
