/**
 * Landing-page hand-off: /app/?url=<letterboxd url> auto-generates a card.
 *
 * This must be captured and stripped from the address bar *before* Faro
 * initializes. Faro attaches `meta.page.url` (= location.href) to every signal,
 * so a query param that is still present at init time ends up on the initial
 * page_view — and that param is the user's Letterboxd URL, which the privacy
 * policy promises we do not collect.
 *
 * `captureHandoffUrl()` therefore runs as the very first statement in main.tsx,
 * ahead of `initFaro()`. `getHandoffUrl()` then hands the value to App.
 */

let handoffUrl = ''
let captured = false

/**
 * Read `?url=` (or `?u=`) out of the current location, remember it, and strip
 * the query from the address bar. Idempotent — safe to call more than once.
 */
export function captureHandoffUrl(): void {
  if (captured) return
  captured = true
  if (typeof window === 'undefined') return

  const params = new URLSearchParams(window.location.search)
  handoffUrl = (params.get('url') ?? params.get('u') ?? '').trim()
  if (!handoffUrl) return

  // Strip the query so it never reaches telemetry, and so a reload doesn't
  // silently re-generate.
  window.history.replaceState(
    null,
    '',
    window.location.pathname + window.location.hash,
  )
}

/**
 * Return the captured hand-off URL, or '' if there wasn't one.
 *
 * Deliberately a pure read rather than a read-and-clear. React StrictMode
 * double-invokes state initializer functions in development, so a clearing
 * read used from `useState(getHandoffUrl)` would hand back the value on the
 * first invocation and '' on the second — leaving the input blank in dev only.
 *
 * Nothing is lost by not clearing: `captureHandoffUrl` already stripped the
 * param from the address bar (so a reload can't re-supply it), and App guards
 * the one-shot generation with a ref.
 */
export function getHandoffUrl(): string {
  return handoffUrl
}

/** Test-only: reset module state between cases. */
export function __resetHandoffForTests(): void {
  handoffUrl = ''
  captured = false
}
