import { describe, it, expect } from 'vitest'
import { canInstallChromeExtension, CHROME_WEB_STORE_URL } from './chromium'

/** Build a minimal Navigator stand-in for the UA-string fallback path. */
function uaOnly(userAgent: string): Navigator {
  return { userAgent } as Navigator
}

/** Build one exercising the Client Hints path. */
function withClientHints(
  brands: string[],
  mobile: boolean,
  platform = 'macOS',
  userAgent = '',
): Navigator {
  return {
    userAgent,
    userAgentData: { brands: brands.map(brand => ({ brand, version: '120' })), mobile, platform },
  } as unknown as Navigator
}

// Real UA strings — the point is to catch a regex that looks right but
// misclassifies a browser people actually use.
const UA = {
  chromeDesktop:  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  chromeWindows:  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  edge:           'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
  opera:          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 OPR/115.0.0.0',
  brave:          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  vivaldi:        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Vivaldi/7.0.3495.11',
  safari:         'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  firefox:        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0',
  chromeAndroid:  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  chromeIOS:      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.0.0 Mobile/15E148 Safari/604.1',
  safariIOS:      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  firefoxIOS:     'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/133.0 Mobile/15E148 Safari/605.1.15',
  edgeAndroid:    'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36 EdgA/131.0.0.0',
}

describe('canInstallChromeExtension — UA fallback', () => {
  it.each([
    ['Chrome (macOS)',  UA.chromeDesktop],
    ['Chrome (Windows)', UA.chromeWindows],
    ['Edge',            UA.edge],
    ['Opera',           UA.opera],
    ['Brave',           UA.brave],
    ['Vivaldi',         UA.vivaldi],
  ])('allows %s', (_name, ua) => {
    expect(canInstallChromeExtension(uaOnly(ua))).toBe(true)
  })

  it.each([
    ['Safari',  UA.safari],
    ['Firefox', UA.firefox],
  ])('rejects %s — cannot install from the Web Store', (_name, ua) => {
    expect(canInstallChromeExtension(uaOnly(ua))).toBe(false)
  })

  it.each([
    ['Chrome on Android', UA.chromeAndroid],
    ['Edge on Android',   UA.edgeAndroid],
    ['Chrome on iOS',     UA.chromeIOS],
    ['Safari on iOS',     UA.safariIOS],
    ['Firefox on iOS',    UA.firefoxIOS],
  ])('rejects %s — mobile cannot install extensions at all', (_name, ua) => {
    expect(canInstallChromeExtension(uaOnly(ua))).toBe(false)
  })
})

describe('canInstallChromeExtension — Client Hints', () => {
  it('allows desktop Chromium', () => {
    expect(canInstallChromeExtension(
      withClientHints(['Chromium', 'Google Chrome', 'Not_A Brand'], false),
    )).toBe(true)
  })

  it('allows desktop Edge, which reports Chromium alongside its own brand', () => {
    expect(canInstallChromeExtension(
      withClientHints(['Chromium', 'Microsoft Edge', 'Not_A Brand'], false),
    )).toBe(true)
  })

  it('allows ChromeOS, which does install extensions', () => {
    expect(canInstallChromeExtension(
      withClientHints(['Chromium', 'Google Chrome'], false, 'Chrome OS'),
    )).toBe(true)
  })

  it('rejects mobile even when the brands look right', () => {
    expect(canInstallChromeExtension(
      withClientHints(['Chromium', 'Google Chrome'], true, 'Android'),
    )).toBe(false)
  })

  it('rejects an Android TABLET, which reports mobile: false', () => {
    // The regression that `mobile` alone does not catch: a large-screen Android
    // device reports mobile:false but still cannot install extensions.
    expect(canInstallChromeExtension(
      withClientHints(['Chromium', 'Google Chrome'], false, 'Android'),
    )).toBe(false)
  })

  it('rejects a GREASE-only brand list', () => {
    expect(canInstallChromeExtension(withClientHints(['Not_A Brand'], false))).toBe(false)
  })

  it('falls back to the UA string when brands is empty', () => {
    // Some browsers expose userAgentData with no usable brands.
    const nav = { userAgent: UA.safari, userAgentData: { brands: [], mobile: false } }
    expect(canInstallChromeExtension(nav as unknown as Navigator)).toBe(false)

    const chrome = { userAgent: UA.chromeDesktop, userAgentData: { brands: [], mobile: false } }
    expect(canInstallChromeExtension(chrome as unknown as Navigator)).toBe(true)
  })
})

describe('edge cases', () => {
  it('does not throw on a missing navigator', () => {
    expect(canInstallChromeExtension(undefined as unknown as Navigator)).toBe(false)
  })

  it('does not throw on an empty user agent', () => {
    expect(canInstallChromeExtension(uaOnly(''))).toBe(false)
  })
})

describe('CHROME_WEB_STORE_URL', () => {
  it('points at the published listing', () => {
    expect(CHROME_WEB_STORE_URL).toBe(
      'https://chromewebstore.google.com/detail/boxd-card/kcholfdhfcojahebmneeeikelffkokdj',
    )
  })
})
