/**
 * Telemetry scrubbing for the web app.
 *
 * The privacy policy (docs/privacy/index.html) promises that we do not collect
 * the Letterboxd username or URL you paste, nor any list/film slug. The
 * hand-written `track()` calls honour that. Faro's *automatic* instrumentation
 * does not — every URL we fetch carries that data in its query string, and the
 * SDK records full URLs in four places:
 *
 *   1. `meta.page.url` (= location.href) is attached to every signal.
 *      The About page hands off via /?url=<letterboxd url>.
 *   2. OTel fetch spans set `http.url` to the full request URL
 *      (@opentelemetry/instrumentation-fetch — `attributes[ATTR_HTTP_URL] = url`).
 *   3. Faro's trace exporter flattens *every* span attribute into a
 *      `faro.tracing.*` event, so (2) leaks a second time.
 *   4. `faro.performance.resource` events default to tracking fetch/xhr
 *      entries and carry `name: <full resource URL>`.
 *   5. Faro's console instrumentation captures `console.warn` and
 *      `console.error` by default (only DEBUG/TRACE/LOG are disabled), so any
 *      diagnostic that interpolates a film title or a poster URL is shipped
 *      as a log or an exception.
 *
 * Our request URLs look like:
 *   https://api.boxd-card.com/?url=https%3A%2F%2Fletterboxd.com%2Fsomeone%2F
 *   https://api.boxd-card.com/tmdb?slug=dune-2021
 *
 * The path is the useful signal; the query is the private part. So the rule is
 * simply: keep origin + pathname, drop search + hash.
 *
 * (2) and (3) are fixed at the source via `applyCustomAttributesOnSpan`
 * (see faro.ts) — overwriting the span attribute also fixes the derived event,
 * because the exporter reads span attributes after the span ends. (1) and (4)
 * are fixed by `scrubTransportItem` below, wired in as Faro's `beforeSend`.
 */

/** Attribute keys known to carry a full request URL. */
export const URL_ATTRIBUTE_KEYS = ['http.url', 'url.full', 'name'] as const

/**
 * Strip the query string and fragment from a URL, keeping origin + pathname.
 * Non-URL strings are returned unchanged — callers pass arbitrary attribute
 * values through here and a plain label must survive intact.
 */
export function sanitizeUrlForTelemetry(value: string): string {
  if (typeof value !== 'string' || !value) return value
  // Cheap guard: only strings that actually look like http(s) URLs are touched.
  if (!/^https?:\/\//i.test(value)) return value
  try {
    const u = new URL(value)
    return `${u.origin}${u.pathname}`
  } catch {
    // Unparseable — drop everything from the first `?` or `#` rather than
    // risk passing the query through.
    return value.split(/[?#]/)[0]
  }
}

/** Shape of the OTLP-JSON attribute entries Faro ships inside trace payloads. */
interface OtlpAttribute {
  key?: string
  value?: { stringValue?: string } & Record<string, unknown>
}

interface OtlpSpan { attributes?: OtlpAttribute[] }
interface OtlpScopeSpan { spans?: OtlpSpan[] }
interface OtlpResourceSpan { scopeSpans?: OtlpScopeSpan[] }

/**
 * Minimal structural view of a Faro transport item. We deliberately do not
 * import Faro's types here: this module is pure and unit-testable without
 * pulling the SDK into the test environment.
 */
export interface ScrubbableItem {
  type?: string
  meta?: { page?: { url?: string } }
  payload?: {
    name?: string
    attributes?: Record<string, string>
    resourceSpans?: OtlpResourceSpan[]
    /** LogEvent */
    message?: string
    /** ExceptionEvent */
    value?: string
  }
}

/**
 * Scrub every known URL-bearing field on a Faro transport item, in place.
 * Returns the same item so it can be used directly as a `beforeSend` hook.
 *
 * Returning the item (never null) keeps the signal — we want the telemetry,
 * just not the query strings.
 */
export function scrubTransportItem<T extends ScrubbableItem>(item: T): T {
  if (!item || typeof item !== 'object') return item

  // 1. page.url — attached to every signal regardless of type.
  const page = item.meta?.page
  if (page && typeof page.url === 'string') {
    page.url = sanitizeUrlForTelemetry(page.url)
  }

  const payload = item.payload
  if (!payload || typeof payload !== 'object') return item

  // 2. Event attributes: `faro.performance.resource` carries `name`, and the
  //    `faro.tracing.*` events carry flattened span attributes. Sweep the known
  //    URL keys plus anything that is itself an http(s) URL — cheap, and it
  //    future-proofs against the SDK adding another URL-valued attribute.
  const attributes = payload.attributes
  if (attributes && typeof attributes === 'object') {
    for (const [key, value] of Object.entries(attributes)) {
      if (typeof value !== 'string') continue
      if ((URL_ATTRIBUTE_KEYS as readonly string[]).includes(key) || /^https?:\/\//i.test(value)) {
        attributes[key] = sanitizeUrlForTelemetry(value)
      }
    }
  }

  // 3. Free text: captured console.warn/console.error become logs and
  //    exceptions. Our own diagnostics are content-free, but this is the
  //    backstop for anything a dependency logs — or anything we add later.
  if (typeof payload.message === 'string') {
    payload.message = sanitizeErrorMessage(payload.message)
  }
  if (typeof payload.value === 'string') {
    payload.value = sanitizeErrorMessage(payload.value)
  }

  // 4. Trace payloads: walk resourceSpans → scopeSpans → spans → attributes.
  //    Belt-and-braces behind applyCustomAttributesOnSpan, which already
  //    rewrites these at the source.
  const resourceSpans = payload.resourceSpans
  if (Array.isArray(resourceSpans)) {
    for (const resourceSpan of resourceSpans) {
      for (const scopeSpan of resourceSpan?.scopeSpans ?? []) {
        for (const span of scopeSpan?.spans ?? []) {
          for (const attribute of span?.attributes ?? []) {
            const key = attribute?.key
            const stringValue = attribute?.value?.stringValue
            if (typeof stringValue !== 'string') continue
            if ((URL_ATTRIBUTE_KEYS as readonly string[]).includes(key ?? '') || /^https?:\/\//i.test(stringValue)) {
              attribute.value!.stringValue = sanitizeUrlForTelemetry(stringValue)
            }
          }
        }
      }
    }
  }

  return item
}

/**
 * Strip anything that looks like a Letterboxd URL or a bare film/list slug out
 * of a free-text error message before it goes into `card_generate_failed`.
 *
 * Scraper errors are hand-written and mostly slug-free, but they wrap upstream
 * reasons — e.g. `No JSON-LD found on film page for "dune-2021"` — so the raw
 * message is not safe to ship.
 */
export function sanitizeErrorMessage(message: string): string {
  if (typeof message !== 'string' || !message) return message
  return message
    // Full URLs anywhere in the text.
    .replace(/https?:\/\/\S+/gi, url => sanitizeUrlForTelemetry(url))
    // Quoted identifiers — how the scraper reports slugs and usernames.
    .replace(/"[^"]*"/g, '"…"')
}
