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

export function track(event: string, attrs: AttrMap = {}): void {
  if (!faro) return
  try {
    const stringAttrs: Record<string, string> = { surface: 'app' }
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined) continue
      stringAttrs[k] = typeof v === 'string' ? v : String(v)
    }
    faro.api.pushEvent(event, stringAttrs)
  } catch {
    // Swallow — telemetry must never crash the app.
  }
}
