import { useState, useEffect } from 'react'
import type { FilmData, FilmDataResponse, GetFilmDataRequest } from '../content/index'
import type { FetchImageResponse } from '../background/service-worker'
import { renderCard } from '../canvas/renderCard'
import { CARD_TYPES, CARD_TYPE_CONFIGS } from '../types'
import type { CardType, ListCount } from '../types'

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
  const [status,      setStatus]      = useState<Status>('idle')
  const [error,       setError]       = useState<string | null>(null)
  const [cardType,    setCardType]    = useState<CardType>('last-four-watched')
  const [listCount,   setListCount]   = useState<ListCount>(4)
  const [isValidPage, setIsValidPage] = useState<boolean | null>(null)
  const [showTitle,   setShowTitle]   = useState(true)
  const [showYear,    setShowYear]    = useState(true)
  const [showRating,  setShowRating]  = useState(true)
  const [showDate,    setShowDate]    = useState(true)
  const [cardUrl,     setCardUrl]     = useState<string | null>(null)
  const [cardBlob,    setCardBlob]    = useState<Blob | null>(null)

  // Validate current tab URL whenever the card type changes
  useEffect(() => {
    setIsValidPage(null)
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      const url = tab?.url ?? ''
      setIsValidPage(CARD_TYPE_CONFIGS[cardType].urlPattern.test(url))
    })
  }, [cardType])

  async function handleGenerate() {
    setStatus('loading')
    setError(null)

    if (cardUrl) URL.revokeObjectURL(cardUrl)
    setCardUrl(null)
    setCardBlob(null)

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id) throw new Error('No active tab')

      // Defensive re-check for race condition (user navigates away after button enabled)
      const url = tab.url ?? ''
      if (!CARD_TYPE_CONFIGS[cardType].urlPattern.test(url)) {
        throw new Error(`Navigate to ${CARD_TYPE_CONFIGS[cardType].urlHint} first.`)
      }

      const filmData: FilmDataResponse = await chrome.tabs.sendMessage(tab.id, {
        type: 'GET_FILM_DATA',
        cardType,
        listCount: (cardType === 'list' || cardType === 'recent-diary') ? listCount : undefined,
      } satisfies GetFilmDataRequest)

      if (!filmData.films.length) {
        throw new Error('No films found on this page.')
      }

      const posterDataUrls = await Promise.all(
        filmData.films.map((f: FilmData) => fetchPosterDataUrl(f.posterUrl))
      )

      const films = filmData.films.map((f: FilmData, i: number) => ({
        title:         f.title,
        year:          f.year,
        rating:        f.rating,
        date:          f.date,
        posterDataUrl: posterDataUrls[i],
      }))

      const blob = await renderCard({
        films,
        username: filmData.username,
        showTitle,
        showYear,
        showRating,
        showDate,
        cardType,
        listCount: (cardType === 'list' || cardType === 'recent-diary') ? listCount : undefined,
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

  const buttonDisabled = status === 'loading' || isValidPage !== true

  return (
    <div style={{ width: 340, padding: 16, fontFamily: 'sans-serif' }}>
      <h1 style={{ fontSize: 17, margin: '0 0 12px', fontWeight: 600 }}>Boxd Card</h1>

      {/* Card type dropdown */}
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4 }}>
          Card type
          <select
            value={cardType}
            onChange={e => setCardType(e.target.value as CardType)}
            style={{ fontSize: 13, padding: '4px 6px' }}
          >
            {CARD_TYPES.map(type => (
              <option key={type} value={type}>
                {CARD_TYPE_CONFIGS[type].label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Film count selector — for List and Recent Diary */}
      {(cardType === 'list' || cardType === 'recent-diary') && (
        <div style={{ marginBottom: 12, display: 'flex', gap: 12, fontSize: 13 }}>
          {([4, 10, 20] as ListCount[]).map(n => (
            <label key={n} style={labelStyle}>
              <input
                type="radio"
                name="listCount"
                value={n}
                checked={listCount === n}
                onChange={() => setListCount(n)}
              />
              {n} films
            </label>
          ))}
        </div>
      )}

      {/* Navigation hint when on wrong page */}
      {isValidPage === false && (
        <p style={{ color: '#e08040', margin: '0 0 10px', fontSize: 12 }}>
          Navigate to {CARD_TYPE_CONFIGS[cardType].urlHint} first.
        </p>
      )}

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
          {cardType === 'recent-diary' ? 'Watch date' : 'Date'}
        </label>
      </div>

      <button
        onClick={handleGenerate}
        disabled={buttonDisabled}
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
