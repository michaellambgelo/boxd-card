import type { GridFit, GridField } from '../canvas/renderCard'
import { LAYOUT_CONFIGS } from '../types'

const GRID_FIELD_PLURALS: Record<GridField, string> = {
  title: 'titles', year: 'years', rating: 'ratings', date: 'dates',
}

function joinList(words: string[]): string {
  if (words.length <= 1) return words.join('')
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`
}

/**
 * The sentence shown under a poster-grid card that dropped its text block to
 * stay inside a fixed frame. Null when nothing switched on is missing.
 */
export function gridFitMessage(fit: GridFit | null): { lead: string; detail: string } | null {
  if (!fit || fit.hiddenFields.length === 0) return null
  const hidden = joinList(fit.hiddenFields.map((f) => GRID_FIELD_PLURALS[f]))
  return {
    lead: `${hidden.charAt(0).toUpperCase()}${hidden.slice(1)} are left off.`,
    detail: `${fit.filmCount} films only fit on ${LAYOUT_CONFIGS[fit.layout].label} as posters.`,
  }
}
