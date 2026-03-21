import { useState } from 'react'
import type { FilmData, FilmDataResponse } from '../content/index'
import type { FetchImageResponse } from '../background/service-worker'
import { renderCard } from '../canvas/renderCard'

type Status = 'idle' | 'loading' | 'ready' | 'error'

async function fetchPosterDataUrl(url: string): Promise<string> {
  const response: FetchImageResponse = await chrome.runtime.sendMessage({
    type: 'FETCH_IMAGE',
    url,
  })
  if (response.error) throw new Error(`Failed to fetch poster: ${response.error}`)
  return response.dataUrl!
}

export default function Popup() {
  const [status,     setStatus]     = useState<Status>('idle')
  const [error,      setError]      = useState<string | null>(null)
  const [showTitle,  setShowTitle]  = useState(true)
  const [showYear,   setShowYear]   = useState(true)
  const [showRating, setShowRating] = useState(true)
  const [showDate,   setShowDate]   = useState(true)
  const [cardUrl,    setCardUrl]    = useState<string | null>(null)
  const [cardBlob,   setCardBlob]   = useState<Blob | null>(null)

  async function handleGenerate() {
    setStatus('loading')
    setError(null)

    // Revoke previous object URL
    if (cardUrl) URL.revokeObjectURL(cardUrl)
    setCardUrl(null)
    setCardBlob(null)

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab.id) throw new Error('No active tab')

      const url = tab.url ?? ''
      if (!url.match(/^https:\/\/letterboxd\.com\/[^/]+\/?$/)) {
        throw new Error('Navigate to a Letterboxd profile page (letterboxd.com/username) first.')
      }

      const filmData: FilmDataResponse = await chrome.tabs.sendMessage(tab.id, {
        type: 'GET_FILM_DATA',
      })

      if (!filmData.films.length) {
        throw new Error('No films found on this profile page.')
      }

      // Fetch all poster images in parallel
      const posterDataUrls = await Promise.all(
        filmData.films.map((f: FilmData) => fetchPosterDataUrl(f.posterUrl))
      )

      const films = filmData.films.map((f: FilmData, i: number) => ({
        title:         f.title,
        year:          f.year,
        rating:        f.rating,
        posterDataUrl: posterDataUrls[i],
      }))

      const blob = await renderCard({
        films,
        username: filmData.username,
        showTitle,
        showYear,
        showRating,
        showDate,
      })

      setCardBlob(blob)
      setCardUrl(URL.createObjectURL(blob))
      setStatus('ready')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus('error')
    }
  }

  function handleDownload() {
    if (!cardUrl) return
    const a = document.createElement('a')
    a.href = cardUrl
    a.download = 'boxd-card.png'
    a.click()
  }

  async function handleCopy() {
    if (!cardBlob) return
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': cardBlob }),
    ])
  }

  const labelStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 6, fontSize: 13,
  }

  return (
    <div style={{ width: 340, padding: 16, fontFamily: 'sans-serif' }}>
      <h1 style={{ fontSize: 17, margin: '0 0 12px', fontWeight: 600 }}>Boxd Card</h1>

      {/* Checkboxes */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', marginBottom: 12 }}>
        <label style={labelStyle}>
          <input type="checkbox" checked={showTitle} onChange={e => setShowTitle(e.target.checked)} />
          Film title
        </label>
        <label style={labelStyle}>
          <input type="checkbox" checked={showYear} onChange={e => setShowYear(e.target.checked)} disabled={!showTitle} />
          Year
        </label>
        <label style={labelStyle}>
          <input type="checkbox" checked={showRating} onChange={e => setShowRating(e.target.checked)} />
          Star rating
        </label>
        <label style={labelStyle}>
          <input type="checkbox" checked={showDate} onChange={e => setShowDate(e.target.checked)} />
          Date
        </label>
      </div>

      <button
        onClick={handleGenerate}
        disabled={status === 'loading'}
        style={{ width: '100%', padding: '8px 0', marginBottom: 8 }}
      >
        {status === 'loading' ? 'Generating…' : 'Generate Card'}
      </button>

      {error && (
        <p style={{ color: '#e05555', margin: '6px 0', fontSize: 13 }}>{error}</p>
      )}

      {status === 'ready' && cardUrl && (
        <>
          <img
            src={cardUrl}
            alt="Boxd Card preview"
            style={{ width: '100%', borderRadius: 4, marginBottom: 8, display: 'block' }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleDownload} style={{ flex: 1, padding: '7px 0' }}>
              Download
            </button>
            <button onClick={handleCopy} style={{ flex: 1, padding: '7px 0' }}>
              Copy
            </button>
          </div>
        </>
      )}
    </div>
  )
}
