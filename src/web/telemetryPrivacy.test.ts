import { describe, it, expect } from 'vitest'
import {
  sanitizeUrlForTelemetry,
  sanitizeErrorMessage,
  scrubTransportItem,
} from './telemetryPrivacy'
import { proxyUrl } from './webScraper'

describe('sanitizeUrlForTelemetry', () => {
  it('drops the query string that carries the pasted Letterboxd URL', () => {
    expect(
      sanitizeUrlForTelemetry(
        'https://api.boxd-card.com/?url=https%3A%2F%2Fletterboxd.com%2Fsomeone%2F',
      ),
    ).toBe('https://api.boxd-card.com/')
  })

  it('drops the film slug from a /tmdb request', () => {
    expect(sanitizeUrlForTelemetry('https://api.boxd-card.com/tmdb?slug=dune-2021'))
      .toBe('https://api.boxd-card.com/tmdb')
  })

  it('drops the ?url= hand-off from the app page URL', () => {
    expect(
      sanitizeUrlForTelemetry('https://boxd-card.com/app/?url=letterboxd.com/someone/#top'),
    ).toBe('https://boxd-card.com/app/')
  })

  it('keeps origin and pathname intact', () => {
    expect(sanitizeUrlForTelemetry('https://boxd-card.com/app/'))
      .toBe('https://boxd-card.com/app/')
  })

  it('leaves non-URL strings alone', () => {
    expect(sanitizeUrlForTelemetry('recent-diary')).toBe('recent-diary')
    expect(sanitizeUrlForTelemetry('')).toBe('')
  })

  it('still strips the query when the URL is unparseable', () => {
    // A scheme we accept but a host the URL parser rejects.
    expect(sanitizeUrlForTelemetry('https://[bad/path?slug=dune-2021'))
      .toBe('https://[bad/path')
  })
})

describe('sanitizeErrorMessage', () => {
  it('removes the film slug the scraper quotes into its error', () => {
    expect(sanitizeErrorMessage('No JSON-LD found on film page for "dune-2021"'))
      .toBe('No JSON-LD found on film page for "…"')
  })

  it('strips query strings out of embedded URLs', () => {
    expect(sanitizeErrorMessage('fetch failed: https://api.boxd-card.com/tmdb?slug=dune-2021'))
      .toBe('fetch failed: https://api.boxd-card.com/tmdb')
  })

  it('leaves a clean message untouched', () => {
    expect(sanitizeErrorMessage('No films found on this page. Check the URL and try again.'))
      .toBe('No films found on this page. Check the URL and try again.')
  })
})

describe('scrubTransportItem', () => {
  it('scrubs meta.page.url on every signal type', () => {
    const item = {
      type: 'event',
      meta: { page: { url: 'https://boxd-card.com/app/?url=letterboxd.com/someone/' } },
      payload: { name: 'page_view' },
    }
    expect(scrubTransportItem(item).meta.page.url).toBe('https://boxd-card.com/app/')
  })

  it('scrubs the name attribute of faro.performance.resource events', () => {
    const item = {
      type: 'event',
      payload: {
        name: 'faro.performance.resource',
        attributes: {
          name: 'https://api.boxd-card.com/tmdb?slug=dune-2021',
          initiatorType: 'fetch',
        },
      },
    }
    const out = scrubTransportItem(item)
    expect(out.payload.attributes.name).toBe('https://api.boxd-card.com/tmdb')
    expect(out.payload.attributes.initiatorType).toBe('fetch')
  })

  it('scrubs flattened http.url on faro.tracing.* events', () => {
    const item = {
      type: 'event',
      payload: {
        name: 'faro.tracing.instrumentation-fetch',
        attributes: {
          'http.url': 'https://api.boxd-card.com/?url=https%3A%2F%2Fletterboxd.com%2Fsomeone%2F',
          'http.method': 'GET',
        },
      },
    }
    const out = scrubTransportItem(item)
    expect(out.payload.attributes['http.url']).toBe('https://api.boxd-card.com/')
    expect(out.payload.attributes['http.method']).toBe('GET')
  })

  it('scrubs http.url inside OTLP trace payloads', () => {
    const item = {
      type: 'trace',
      payload: {
        resourceSpans: [{
          scopeSpans: [{
            spans: [{
              attributes: [
                { key: 'http.url', value: { stringValue: 'https://api.boxd-card.com/tmdb?slug=dune-2021' } },
                { key: 'http.method', value: { stringValue: 'GET' } },
              ],
            }],
          }],
        }],
      },
    }
    const attrs = scrubTransportItem(item).payload.resourceSpans[0].scopeSpans[0].spans[0].attributes
    expect(attrs[0].value.stringValue).toBe('https://api.boxd-card.com/tmdb')
    expect(attrs[1].value.stringValue).toBe('GET')
  })

  it('scrubs captured console.warn log messages', () => {
    // Faro captures console.warn by default (only DEBUG/TRACE/LOG are off).
    const item = {
      type: 'log',
      payload: { message: '[tmdb] enrichment failed for "dune-2021"', level: 'warn' },
    }
    expect(scrubTransportItem(item).payload.message)
      .toBe('[tmdb] enrichment failed for "…"')
  })

  it('scrubs exception values', () => {
    const item = {
      type: 'exception',
      payload: { type: 'Error', value: 'fetch failed: https://api.boxd-card.com/tmdb?slug=dune-2021' },
    }
    expect(scrubTransportItem(item).payload.value)
      .toBe('fetch failed: https://api.boxd-card.com/tmdb')
  })

  it('never drops a signal', () => {
    const item = { type: 'log', payload: {} }
    expect(scrubTransportItem(item)).toBe(item)
  })

  it('tolerates missing meta, payload, and nested trace fields', () => {
    expect(() => scrubTransportItem({})).not.toThrow()
    expect(() => scrubTransportItem({ type: 'trace', payload: { resourceSpans: [{}] } })).not.toThrow()
    expect(() => scrubTransportItem({ type: 'trace', payload: { resourceSpans: [{ scopeSpans: [{ spans: [{}] }] }] } })).not.toThrow()
  })
})

// The scrubber is only correct as long as the private data actually lives in
// the query string. If someone moves it into the path (e.g. /proxy/<url>),
// sanitizeUrlForTelemetry would happily pass it through — so assert the
// invariant against the real URL builder rather than a hand-written string.
describe('scrubbing the URLs the app actually builds', () => {
  const USERNAME = 'somebody-private'
  const SLUG = 'a-very-specific-film-2021'

  it('leaves no trace of the username in a proxied page fetch', () => {
    const url = proxyUrl(`https://letterboxd.com/${USERNAME}/diary/`)
    expect(url).toContain(USERNAME)              // precondition: it IS in there
    expect(sanitizeUrlForTelemetry(url)).not.toContain(USERNAME)
  })

  it('leaves no trace of the username in a proxied image fetch', () => {
    const url = proxyUrl(`https://letterboxd.com/${USERNAME}/avatar.jpg`, 'image')
    expect(url).toContain(USERNAME)
    expect(sanitizeUrlForTelemetry(url)).not.toContain(USERNAME)
  })

  it('leaves no trace of the film slug in a TMDB lookup', () => {
    // Mirrors tmdbClient.fetchTmdbData's URL construction.
    const url = `https://api.boxd-card.com/tmdb?slug=${encodeURIComponent(SLUG)}`
    expect(url).toContain(SLUG)
    expect(sanitizeUrlForTelemetry(url)).not.toContain(SLUG)
  })

  it('leaves no trace of either in a resource-timing event', () => {
    const item = {
      type: 'event',
      meta: { page: { url: `https://boxd-card.com/app/?url=letterboxd.com/${USERNAME}/` } },
      payload: {
        name: 'faro.performance.resource',
        attributes: { name: proxyUrl(`https://letterboxd.com/${USERNAME}/`) },
      },
    }
    const serialized = JSON.stringify(scrubTransportItem(item))
    expect(serialized).not.toContain(USERNAME)
  })
})
