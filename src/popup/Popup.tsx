import { useState, useEffect } from 'react'
import type { FilmData, FilmDataResponse, GetFilmDataRequest } from '../content/index'
import type { FetchImageResponse } from '../background/service-worker'
import { renderCard } from '../canvas/renderCard'
import { CARD_TYPES, CARD_TYPE_CONFIGS } from '../types'
import type { CardType, ListCount } from '../types'
import styles from './Popup.module.css'

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
  const [showTitle,     setShowTitle]     = useState(true)
  const [showYear,      setShowYear]      = useState(true)
  const [showRating,    setShowRating]    = useState(true)
  const [showDate,      setShowDate]      = useState(true)
  const [showListTitle,      setShowListTitle]      = useState(true)
  const [showListDesc,       setShowListDesc]       = useState(true)
  const [showCardTypeLabel,  setShowCardTypeLabel]  = useState(true)
  const [cardUrl,       setCardUrl]       = useState<string | null>(null)
  const [cardBlob,      setCardBlob]      = useState<Blob | null>(null)

  // On mount: auto-select the card type matching the current tab URL
  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      const url = tab?.url ?? ''
      const match = CARD_TYPES.find(t => CARD_TYPE_CONFIGS[t].urlPattern.test(url))
      if (match) setCardType(match)
    })
  }, [])

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

      const posterResults = await Promise.allSettled(
        filmData.films.map((f: FilmData) => fetchPosterDataUrl(f.posterUrl))
      )
      const failedCount = posterResults.filter(r => r.status === 'rejected').length
      if (failedCount > 0) {
        throw new Error(
          `${failedCount} poster${failedCount === 1 ? '' : 's'} failed to load. Try refreshing the page.`
        )
      }
      const posterDataUrls = posterResults.map(r => (r as PromiseFulfilledResult<string>).value)

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
        showListTitle:       cardType === 'list' ? showListTitle : undefined,
        showListDescription: cardType === 'list' ? showListDesc  : undefined,
        listTitle:           cardType === 'list' ? filmData.listTitle       : undefined,
        listDescription:     cardType === 'list' ? filmData.listDescription : undefined,
        showCardTypeLabel:   cardType !== 'list' ? showCardTypeLabel : undefined,
        cardTypeLabel:       cardType !== 'list' ? CARD_TYPE_CONFIGS[cardType].label : undefined,
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

  const buttonDisabled = status === 'loading' || isValidPage !== true

  return (
    <div className={styles.popup}>
      {status === 'loading' && <div className={styles.loadingBar} />}

      <header className={styles.header}>
        <svg viewBox="0 0 500 500" xmlns="http://www.w3.org/2000/svg" width="28" height="28" aria-hidden="true">
          <defs>
            <linearGradient id="bc-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%"   stopColor="#EF8D22" />
              <stop offset="50%"  stopColor="#0EDF52" />
              <stop offset="100%" stopColor="#40BCF4" />
            </linearGradient>
            <mask id="bc-mask">
              <circle cx="250" cy="250" r="250" fill="white" />
              <text x="250" y="250" textAnchor="middle" dominantBaseline="central"
                fontFamily="Arial Black, Arial, Helvetica, sans-serif"
                fontWeight="900" fontSize="230" fill="black">BC</text>
            </mask>
          </defs>
          <circle cx="250" cy="250" r="250" fill="url(#bc-grad)" mask="url(#bc-mask)" />
        </svg>
        <h1>Boxd Card</h1>
      </header>

      <div className={styles.body}>
        {/* Card type dropdown */}
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Card type</span>
          <select
            className={styles.select}
            value={cardType}
            onChange={e => setCardType(e.target.value as CardType)}
          >
            {CARD_TYPES.map(type => (
              <option key={type} value={type}>
                {CARD_TYPE_CONFIGS[type].label}
              </option>
            ))}
          </select>
        </div>

        {/* Film count selector — for List and Recent Diary */}
        {(cardType === 'list' || cardType === 'recent-diary') && (
          <div className={styles.radioGroup}>
            {([4, 10, 20] as ListCount[]).map(n => (
              <label key={n} className={styles.checkboxLabel}>
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
          <p className={styles.hint}>
            Navigate to {CARD_TYPE_CONFIGS[cardType].urlHint} first.
          </p>
        )}

        {/* List title / description checkboxes */}
        {cardType === 'list' && (
          <div className={styles.checkboxGrid}>
            <label className={styles.checkboxLabel}>
              <input type="checkbox" checked={showListTitle} onChange={e => setShowListTitle(e.target.checked)} />
              List title
            </label>
            <label className={styles.checkboxLabel}>
              <input type="checkbox" checked={showListDesc} onChange={e => setShowListDesc(e.target.checked)} />
              Description
            </label>
          </div>
        )}

        {/* Card type label checkbox — for non-list types */}
        {cardType !== 'list' && (
          <div>
            <label className={styles.checkboxLabel}>
              <input type="checkbox" checked={showCardTypeLabel} onChange={e => setShowCardTypeLabel(e.target.checked)} />
              Card type label
            </label>
          </div>
        )}

        {/* Display option checkboxes */}
        <div className={styles.checkboxGrid}>
          <label className={styles.checkboxLabel}>
            <input type="checkbox" checked={showTitle} onChange={e => setShowTitle(e.target.checked)} />
            Film title
          </label>
          <label className={styles.checkboxLabel}>
            <input type="checkbox" checked={showYear} onChange={e => setShowYear(e.target.checked)} disabled={!showTitle} />
            Year
          </label>
          <label className={styles.checkboxLabel}>
            <input type="checkbox" checked={showRating} onChange={e => setShowRating(e.target.checked)} />
            Star rating
          </label>
          <label className={styles.checkboxLabel}>
            <input type="checkbox" checked={showDate} onChange={e => setShowDate(e.target.checked)} />
            {cardType === 'recent-diary' ? 'Watch date' : 'Date'}
          </label>
        </div>

        <button
          className={styles.generateBtn}
          onClick={handleGenerate}
          disabled={buttonDisabled}
        >
          {status === 'loading' ? 'Generating…' : 'Generate Card'}
        </button>

        {error && <p className={styles.error}>{error}</p>}

        {status === 'ready' && cardUrl && (
          <>
            <a href={cardUrl} target="_blank" rel="noreferrer">
              <img
                src={cardUrl}
                alt="Boxd Card preview"
                className={styles.preview}
              />
            </a>
            <div className={styles.actionRow}>
              <button className={styles.actionBtn} onClick={handleDownload}>Download</button>
              <button className={styles.actionBtn} onClick={handleCopy}>Copy</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
