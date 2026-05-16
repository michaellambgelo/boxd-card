import { initializeFaro, getWebInstrumentations, type Faro } from '@grafana/faro-web-sdk'
import { TracingInstrumentation } from '@grafana/faro-web-tracing'

let faro: Faro | undefined

type AttrValue = string | number | boolean | null | undefined
type AttrMap = Record<string, AttrValue>

export function initFaro(): void {
  const proxyUrl = import.meta.env.VITE_FARO_PROXY_URL as string | undefined
  if (!proxyUrl) return
  try {
    faro = initializeFaro({
      url: `${String(proxyUrl).replace(/\/+$/, '')}/faro-proxy?app=boxd-card`,
      app: {
        name: 'boxd-card',
        version: (import.meta.env.VITE_APP_VERSION as string) || '0.0.0',
        environment: import.meta.env.MODE,
      },
      instrumentations: [
        ...getWebInstrumentations(),
        new TracingInstrumentation(),
      ],
    })
  } catch (err) {
    // Faro init failures must never block app boot.
    console.warn('Faro init failed:', err)
  }
}

function toStringAttrs(attrs: AttrMap): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined) continue
    out[k] = typeof v === 'string' ? v : String(v)
  }
  return out
}

export function track(event: string, attrs: AttrMap = {}): void {
  if (!faro) return
  try {
    faro.api.pushEvent(event, { surface: 'app', ...toStringAttrs(attrs) })
  } catch {
    // Swallow — telemetry must never crash the app.
  }
}

/**
 * Start a manual user action that scopes any signals (events, errors,
 * fetch perf entries) emitted during its lifetime. Use for async flows
 * — a click that triggers fetches/renders — so all related telemetry
 * gets correlated via `action.name`.
 *
 * Returns an object with `end()`. Calling `end()` is optional but
 * recommended to terminate the action immediately rather than waiting
 * for the SDK's idle heuristic.
 */
export function startAction(
  name: string,
  attrs: AttrMap = {},
): { end: () => void } | undefined {
  if (!faro) return undefined
  try {
    const action = faro.api.startUserAction(name, toStringAttrs({ surface: 'app', ...attrs }))
    if (!action) return undefined
    return {
      end: () => {
        try {
          (action as unknown as { end?: () => void }).end?.()
        } catch { /* swallow */ }
      },
    }
  } catch {
    return undefined
  }
}
