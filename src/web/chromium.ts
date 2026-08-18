/**
 * Can this browser install an extension from the Chrome Web Store?
 *
 * Used to decide whether to show the "Add to Chrome" button. The bar is
 * deliberately "can actually install it", not "is called Chrome":
 *
 * - **Included:** Chrome, Edge, Brave, Opera, Vivaldi, Arc. All are Chromium on
 *   the desktop and all install from the Web Store, so hiding the button from
 *   them would be wrong.
 * - **Excluded:** Safari and Firefox, which can't.
 * - **Excluded: mobile.** This is the easy bug. Chrome on Android reports
 *   `Chrome/` in its UA and looks exactly like a supported browser, but Android
 *   and iOS Chrome cannot install extensions at all. Showing an install button
 *   there is a dead end.
 *
 * A near-identical copy of this logic lives inline in docs/about/index.html,
 * which is hand-written and has no build step. Keep the two in step — the same
 * arrangement the landing page already uses for `scrubUrl`, which mirrors
 * `sanitizeUrlForTelemetry` in telemetryPrivacy.ts.
 */

/** The slice of the User-Agent Client Hints API we rely on. */
interface UADataBrand { brand: string; version: string }
interface NavigatorUAData {
  brands?: UADataBrand[]
  mobile?: boolean
  platform?: string
}
type NavigatorWithUAData = Navigator & { userAgentData?: NavigatorUAData }

/** Brands that identify a Chromium engine in the Client Hints `brands` list. */
const CHROMIUM_BRANDS = ['Chromium', 'Google Chrome']

export function canInstallChromeExtension(nav: Navigator = navigator): boolean {
  if (!nav) return false

  // Preferred path: Client Hints, available on Chromium 90+. `mobile` is
  // reported directly, so we don't have to infer it from the UA string.
  const uaData = (nav as NavigatorWithUAData).userAgentData
  if (uaData?.brands?.length) {
    if (uaData.mobile) return false
    // `mobile: false` is not enough: Android *tablets* report false, and no
    // Android Chrome can install extensions at any form factor. ChromeOS
    // reports 'Chrome OS' here and correctly stays eligible.
    if (uaData.platform === 'Android') return false
    return uaData.brands.some(b => CHROMIUM_BRANDS.includes(b.brand))
  }

  // Fallback: UA sniffing, for Safari and Firefox (no Client Hints) and for
  // older Chromium.
  const ua = nav.userAgent || ''

  // Mobile first — Chrome on Android matches /Chrome\// below but can't install.
  if (/Android|iPhone|iPad|iPod/i.test(ua)) return false

  // iOS browsers are all WebKit wrappers regardless of their branding.
  if (/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua)) return false

  if (/Firefox\//.test(ua)) return false

  // Safari has no `Chrome/` token, so this excludes it. Edge (`Edg/`) and
  // Opera (`OPR/`) both keep `Chrome/` and are intentionally allowed through.
  return /Chrome\/|Chromium\//.test(ua)
}

/** The public listing. Kept here so the app and its tests share one constant. */
export const CHROME_WEB_STORE_URL =
  'https://chromewebstore.google.com/detail/boxd-card/kcholfdhfcojahebmneeeikelffkokdj'
