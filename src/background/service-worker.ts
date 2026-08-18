import type { TmdbFilmData } from '../shared/tmdb'

// Show the action only on letterboxd.com pages; hidden everywhere else.
chrome.runtime.onInstalled.addListener(() => {
  chrome.declarativeContent.onPageChanged.removeRules(undefined, () => {
    chrome.declarativeContent.onPageChanged.addRules([{
      conditions: [
        new chrome.declarativeContent.PageStateMatcher({
          pageUrl: { hostEquals: 'letterboxd.com', schemes: ['https'] },
        }),
      ],
      actions: [ new chrome.declarativeContent.ShowAction() ],
    }])
  })
})

export interface FetchImageRequest {
  type: 'FETCH_IMAGE'
  url: string
}

export interface FetchImageResponse {
  dataUrl?: string
  error?: string
}

export interface FetchTmdbRequest {
  type: 'FETCH_TMDB'
  slug: string
}

export interface FetchTmdbResponse {
  data?: TmdbFilmData | null
  error?: string
}

const TMDB_WORKER_BASE = 'https://api.boxd-card.com'

/**
 * Hosts FETCH_IMAGE is allowed to fetch. Mirrors `host_permissions` in
 * manifest.json — anything outside this list would be a cross-origin fetch the
 * browser blocks anyway, so the allowlist can only reject requests that were
 * already going to fail. Its value is keeping the handler from becoming a
 * general-purpose fetch proxy if the message surface ever widens.
 */
const ALLOWED_IMAGE_HOSTS = [
  'letterboxd.com',
  'a.ltrbxd.com',
  's.ltrbxd.com',
  'image.tmdb.org',
]

function isAllowedImageUrl(rawUrl: string): boolean {
  let url: URL
  try { url = new URL(rawUrl) } catch { return false }
  if (url.protocol !== 'https:') return false
  return ALLOWED_IMAGE_HOSTS.some(h => url.hostname === h || url.hostname.endsWith(`.${h}`))
}

/**
 * Only the extension's own popup and content scripts may drive these handlers.
 *
 * Today this is belt-and-braces: messages from other extensions arrive on
 * `onMessageExternal` (which we don't register), and page script can't reach
 * `chrome.runtime` from the isolated world. The check exists so that adding
 * `externally_connectable` later can't silently turn FETCH_IMAGE into an
 * open fetch proxy for whoever is allowed to connect.
 */
function isTrustedSender(sender: chrome.runtime.MessageSender): boolean {
  return sender?.id === chrome.runtime.id
}

type Message = FetchImageRequest | FetchTmdbRequest

chrome.runtime.onMessage.addListener(
  (message: Message, sender, sendResponse) => {
    if (!isTrustedSender(sender)) return

    if (message.type === 'FETCH_IMAGE') {
      if (!isAllowedImageUrl(message.url)) {
        sendResponse({ error: 'Refusing to fetch a non-allowlisted URL' } satisfies FetchImageResponse)
        return true
      }
      fetch(message.url)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          return res.blob()
        })
        .then((blob) => {
          const reader = new FileReader()
          reader.onloadend = () =>
            sendResponse({ dataUrl: reader.result as string } satisfies FetchImageResponse)
          reader.readAsDataURL(blob)
        })
        .catch((err) =>
          sendResponse({ error: String(err) } satisfies FetchImageResponse)
        )
      return true // keep message channel open for async response
    }

    if (message.type === 'FETCH_TMDB') {
      if (!message.slug) {
        sendResponse({ data: null } satisfies FetchTmdbResponse)
        return true
      }
      fetch(`${TMDB_WORKER_BASE}/tmdb?slug=${encodeURIComponent(message.slug)}`)
        .then(async (res) => {
          if (res.status === 404) {
            sendResponse({ data: null } satisfies FetchTmdbResponse)
            return
          }
          if (!res.ok) {
            sendResponse({ error: `HTTP ${res.status} fetching TMDB data` } satisfies FetchTmdbResponse)
            return
          }
          const data = (await res.json()) as TmdbFilmData
          sendResponse({ data } satisfies FetchTmdbResponse)
        })
        .catch((err) =>
          sendResponse({ error: String(err) } satisfies FetchTmdbResponse)
        )
      return true
    }
  }
)
