/**
 * Feedback payload — the one schema shared by the extension popup (which
 * builds and previews it) and the worker (which validates and stores it).
 *
 * Feedback is extension-only. The web app has Faro telemetry; the extension
 * deliberately has none, so this is the only channel by which an extension
 * user's error reaches us — and it only moves when they press Send, after
 * seeing exactly what will go.
 *
 * Kept pure (no DOM, no chrome.*): the worker's tsconfig targets the Workers
 * runtime and imports this file directly, so validation can't drift between
 * the side that builds a payload and the side that accepts it.
 *
 * What is deliberately NOT here: the page URL. The Letterboxd tab URL carries
 * a username, and the privacy policy promises we don't collect it. Error
 * strings can embed one too (the navigation hint does), so they go through
 * `scrubErrorMessage` before they're shown or sent.
 */

export const FEEDBACK_ENDPOINT = 'https://api.boxd-card.com/feedback'

export const FEEDBACK_KINDS = ['error', 'feedback'] as const
export type FeedbackKind = typeof FEEDBACK_KINDS[number]

export const FEEDBACK_LIMITS = {
  /** Whole request body, bytes. Anything larger is refused before parsing. */
  body: 16 * 1024,
  message: 4000,
  email: 254,
  errorMessage: 1000,
  /** Every other diagnostics string (versions, user agent, enum values). */
  shortField: 300,
} as const

/** Retention, in days. The privacy policy states this number — keep in sync. */
export const FEEDBACK_RETENTION_DAYS = 180

export interface FeedbackDiagnostics {
  extVersion: string
  userAgent: string
  cardType?: string
  layout?: string
  listCount?: number
  reviewCount?: number
  statsCategory?: string
  tmdbEnabled?: boolean
  /** Scrubbed — see scrubErrorMessage. */
  errorMessage?: string
}

export interface FeedbackPayload {
  kind: FeedbackKind
  message: string
  email?: string
  diagnostics?: FeedbackDiagnostics
}

export type FeedbackValidation =
  | { ok: true; value: FeedbackPayload }
  | { ok: false; error: string }

// Deliberately loose: the point is to reject garbage, not to adjudicate RFC
// 5322. A typo'd address just means no reply; a bounced Reply-To costs nothing.
const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/

/**
 * Strip anything identifying out of an error string before it is previewed
 * or sent:
 *   - full URLs collapse to their host (paths carry usernames and slugs);
 *   - bare `letterboxd.com/<user>/…` (how the navigation hint is phrased)
 *     loses everything after the host;
 *   - quoted identifiers — how scrapers report slugs and titles — are elided.
 */
export function scrubErrorMessage(message: string): string {
  return message
    .replace(/https?:\/\/([^\s/]+)\S*/gi, (_m, host: string) => `https://${host}/…`)
    .replace(/(?<![\w./])letterboxd\.com\/\S+/gi, 'letterboxd.com/…')
    .replace(/"[^"]*"/g, '"…"')
    .slice(0, FEEDBACK_LIMITS.errorMessage)
}

class InvalidField extends Error {}

/** Absent/empty → undefined; present but wrong type or too long → throws. */
function optionalString(value: unknown, max: number): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string' || value.length > max) throw new InvalidField()
  return value
}

function optionalCount(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 100) throw new InvalidField()
  return value
}

function optionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'boolean') throw new InvalidField()
  return value
}

function readDiagnostics(d: Record<string, unknown>): FeedbackDiagnostics {
  const short = FEEDBACK_LIMITS.shortField
  const cardType = optionalString(d.cardType, short)
  const layout = optionalString(d.layout, short)
  const listCount = optionalCount(d.listCount)
  const reviewCount = optionalCount(d.reviewCount)
  const statsCategory = optionalString(d.statsCategory, short)
  const tmdbEnabled = optionalBoolean(d.tmdbEnabled)
  const errorMessage = optionalString(d.errorMessage, FEEDBACK_LIMITS.errorMessage)
  return {
    extVersion: optionalString(d.extVersion, short) ?? '',
    userAgent: optionalString(d.userAgent, short) ?? '',
    ...(cardType !== undefined && { cardType }),
    ...(layout !== undefined && { layout }),
    ...(listCount !== undefined && { listCount }),
    ...(reviewCount !== undefined && { reviewCount }),
    ...(statsCategory !== undefined && { statsCategory }),
    ...(tmdbEnabled !== undefined && { tmdbEnabled }),
    // Scrubbed again server-side: the client is untrusted, and this is the
    // field most likely to carry a username by accident.
    ...(errorMessage !== undefined && { errorMessage: scrubErrorMessage(errorMessage) }),
  }
}

/**
 * Validate an untrusted payload. Rebuilds the object field by field, so
 * anything a client adds that isn't in the schema is dropped rather than
 * stored — the KV record can only ever contain what this function names.
 */
export function validateFeedback(input: unknown): FeedbackValidation {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, error: 'Expected a JSON object' }
  }
  const raw = input as Record<string, unknown>

  if (!FEEDBACK_KINDS.includes(raw.kind as FeedbackKind)) {
    return { ok: false, error: 'kind must be "error" or "feedback"' }
  }
  const kind = raw.kind as FeedbackKind

  const message = typeof raw.message === 'string' ? raw.message.trim() : ''
  if (message.length > FEEDBACK_LIMITS.message) {
    return { ok: false, error: `message is longer than ${FEEDBACK_LIMITS.message} characters` }
  }

  let email: string | undefined
  try {
    email = optionalString(typeof raw.email === 'string' ? raw.email.trim() : raw.email, FEEDBACK_LIMITS.email)
  } catch {
    email = ''
  }
  if (email !== undefined && !EMAIL_RE.test(email)) {
    return { ok: false, error: 'email is not a valid address' }
  }

  let diagnostics: FeedbackDiagnostics | undefined
  if (raw.diagnostics !== undefined && raw.diagnostics !== null) {
    if (typeof raw.diagnostics !== 'object' || Array.isArray(raw.diagnostics)) {
      return { ok: false, error: 'diagnostics must be an object' }
    }
    try {
      diagnostics = readDiagnostics(raw.diagnostics as Record<string, unknown>)
    } catch {
      return { ok: false, error: 'diagnostics contains an invalid field' }
    }
  }

  // An error report may arrive with no words — the diagnostics are the
  // report. General feedback with nothing in it is not worth a KV write.
  if (!message && !(kind === 'error' && diagnostics?.errorMessage)) {
    return { ok: false, error: 'message is required' }
  }

  return {
    ok: true,
    value: {
      kind,
      message,
      ...(email !== undefined && { email }),
      ...(diagnostics !== undefined && { diagnostics }),
    },
  }
}

/**
 * POST a payload. Resolves with the stored id; rejects with a message fit to
 * show the user. Validates locally first so the popup reports a bad email
 * without a round trip.
 */
export async function submitFeedback(
  payload: FeedbackPayload,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const check = validateFeedback(payload)
  if (!check.ok) throw new Error(check.error)

  let res: Response
  try {
    res = await fetchImpl(FEEDBACK_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(check.value),
    })
  } catch {
    throw new Error('Could not reach the feedback server. Check your connection and try again.')
  }
  if (res.status === 429) throw new Error('Too many submissions — please try again in a minute.')
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 200)
    throw new Error(detail || `Feedback failed (HTTP ${res.status}).`)
  }
  const body = await res.json().catch(() => ({})) as { id?: unknown }
  return typeof body.id === 'string' ? body.id : ''
}
