export interface FetchImageRequest {
  type: 'FETCH_IMAGE'
  url: string
}

export interface FetchImageResponse {
  dataUrl?: string
  error?: string
}

chrome.runtime.onMessage.addListener(
  (message: FetchImageRequest, _sender, sendResponse) => {
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
  }
)
