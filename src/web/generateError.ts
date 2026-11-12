import type { CardType } from '../types'

/**
 * Why a generate attempt failed, as sent in the `reason` attribute of the
 * `card_generate_failed` telemetry event.
 *
 * - `empty`   — the page loaded but the scrape found nothing to put on a card.
 *               Usually the visitor's input (no favorites set, empty list, wrong
 *               URL), but a Letterboxd markup change that breaks a selector lands
 *               here too: this class cannot tell the two apart.
 * - `posters` — every poster image failed to load.
 * - `fetch`   — fetching or scraping the Letterboxd page threw.
 * - `render`  — anything after scraping: canvas render, blob export.
 */
export type GenerateFailureReason = 'empty' | 'posters' | 'fetch' | 'render'

/** Which part of the pipeline was running when an untagged error was thrown. */
export type GenerateStage = 'fetch' | 'render'

/** An error that knows its own failure reason. */
export class GenerateError extends Error {
  readonly reason: GenerateFailureReason

  constructor(reason: GenerateFailureReason, message: string) {
    super(message)
    this.name = 'GenerateError'
    this.reason = reason
  }
}

/** A tagged error carries its reason; anything else is classed by the stage it was thrown in. */
export function failureReason(err: unknown, stage: GenerateStage): GenerateFailureReason {
  return err instanceof GenerateError ? err.reason : stage
}

export function emptyFilmsError(cardType: CardType): GenerateError {
  return new GenerateError(
    'empty',
    cardType === 'favorites'
      ? "No favorite films found on this profile."
      : 'No films found on this page. Check the URL and try again.',
  )
}

export function emptyStatsError(): GenerateError {
  return new GenerateError('empty', 'No stats data found on this page. Check the URL and try again.')
}

export function allPostersFailedError(firstRejection: unknown): GenerateError {
  return new GenerateError('posters', `All poster images failed to load. (${String(firstRejection ?? 'unknown')})`)
}
