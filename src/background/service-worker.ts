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

const TMDB_WORKER_BASE = 'https://boxd-card.michaellamb.workers.dev'

type Message = FetchImageRequest | FetchTmdbRequest

chrome.runtime.onMessage.addListener(
  (message: Message, _sender, sendResponse) => {
    if (message.type === 'FETCH_IMAGE') {
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
