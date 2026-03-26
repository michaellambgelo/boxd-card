import { useState, useEffect } from 'react'
import type { FilmData, FilmDataResponse, GetFilmDataRequest } from '../content/index'
import type { FetchImageResponse } from '../background/service-worker'
import { renderCard } from '../canvas/renderCard'
import { CARD_TYPES, CARD_TYPE_CONFIGS, LAYOUTS, LAYOUT_CONFIGS } from '../types'
import type { CardType, ListCount, ReviewCount, Layout } from '../types'
import { loadSettings, saveSettings } from '../storage/settings'
import styles from './Popup.module.css'

type Status = 'idle' | 'loading' | 'ready' | 'error'
type View = 'main' | 'settings'

async function fetchPosterDataUrl(url: string): Promise<string> {
  const response: FetchImageResponse = await chrome.runtime.sendMessage({
    type: 'FETCH_IMAGE',
    url,
  })
  if (response.error) throw new Error(`Failed to fetch poster: ${response.error}`)
  return response.dataUrl!
}

export default function Popup() {
  const [view,        setView]        = useState<View>('main')
  const [status,      setStatus]      = useState<Status>('idle')
  const [error,       setError]       = useState<string | null>(null)
  const [cardType,    setCardType]    = useState<CardType>('last-four-watched')
  const [listCount,   setListCount]   = useState<ListCount>(4)
  const [reviewCount, setReviewCount] = useState<ReviewCount>(1)
  const [isValidPage,      setIsValidPage]      = useState<boolean | null>(null)
  const [isReviewListPage, setIsReviewListPage] = useState(false)
  const [showTitle,     setShowTitle]     = useState(true)
  const [showYear,      setShowYear]      = useState(true)
  const [showRating,    setShowRating]    = useState(true)
  const [showDate,      setShowDate]      = useState(true)
  const [showListTitle,      setShowListTitle]      = useState(true)
  const [showListDesc,       setShowListDesc]       = useState(true)
  const [showCardTypeLabel,  setShowCardTypeLabel]  = useState(true)
  const [showTags,           setShowTags]           = useState(true)
  const [showBackdrop,       setShowBackdrop]       = useState(true)
  const [layout,        setLayout]        = useState<Layout>('landscape')
  const [updateAvailable, setUpdateAvailable] = useState<string | null>(null)
  const [cardUrl,       setCardUrl]       = useState<string | null>(null)
  const [cardBlob,      setCardBlob]      = useState<Blob | null>(null)
  const [copied,        setCopied]        = useState(false)

  // On mount: check for newer release on GitHub
  useEffect(() => {
    fetch('https://api.github.com/repos/michaellambgelo/boxd-card/releases/latest')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.tag_name) return
        const latest = data.tag_name.replace(/^v/, '')
        const current = chrome.runtime.getManifest().version
        const latestParts = latest.split('.').map(Number)
        const currentParts = current.split('.').map(Number)
        for (let i = 0; i < Math.max(latestParts.length, currentParts.length); i++) {
          const l = latestParts[i] ?? 0
          const c = currentParts[i] ?? 0
          if (l > c) { setUpdateAvailable(latest); return }
          if (l < c) return
        }
      })
      .catch(() => {})
  }, [])

  // On mount: load persisted settings + auto-select card type from tab URL
  useEffect(() => {
    loadSettings().then(s => {
      setListCount(s.listCount)
      setReviewCount(s.reviewCount)
      setShowTitle(s.showTitle)
      setShowYear(s.showYear)
      setShowRating(s.showRating)
      setShowDate(s.showDate)
      setShowListTitle(s.showListTitle)
      setShowListDesc(s.showListDesc)
      setShowCardTypeLabel(s.showCardTypeLabel)
      setShowTags(s.showTags)
      setShowBackdrop(s.showBackdrop)
      setLayout(s.layout)
    })
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      const url = (tab?.url ?? '').replace(/#.*$/, '')
      const match = CARD_TYPES.find(t => CARD_TYPE_CONFIGS[t].urlPattern.test(url))
      if (match) setCardType(match)
    })
  }, [])

  // Validate current tab URL whenever the card type changes
  useEffect(() => {
    setIsValidPage(null)
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      const url = (tab?.url ?? '').replace(/#.*$/, '')
      setIsValidPage(CARD_TYPE_CONFIGS[cardType].urlPattern.test(url))
      setIsReviewListPage(cardType === 'review' && /\/reviews\/?$/.test(url))
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
      const url = (tab.url ?? '').replace(/#.*$/, '')
      if (!CARD_TYPE_CONFIGS[cardType].urlPattern.test(url)) {
        throw new Error(`Navigate to ${CARD_TYPE_CONFIGS[cardType].urlHint} first.`)
      }

      const filmData: FilmDataResponse = await chrome.tabs.sendMessage(tab.id, {
        type: 'GET_FILM_DATA',
        cardType,
        listCount: (cardType === 'list' || cardType === 'recent-diary') ? listCount : undefined,
        reviewCount: cardType === 'review' ? reviewCount : undefined,
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

      let backdropDataUrl: string | undefined
      if (showBackdrop && filmData.backdropUrl && (cardType === 'review' || cardType === 'list')) {
        try {
          backdropDataUrl = await fetchPosterDataUrl(filmData.backdropUrl)
        } catch {
          // Non-fatal: render without backdrop
        }
      }

      const isOwnProfile = !!(
        filmData.loggedInUsername &&
        filmData.loggedInUsername.toLowerCase() === filmData.username.toLowerCase()
      )

      // Footer always shows the page author. On own profile we use the logged-in
      // avatar (same person); on other profiles we fetch the author's avatar.
      const avatarUrlToFetch = isOwnProfile
        ? filmData.loggedInAvatarUrl
        : filmData.authorAvatarUrl
      let footerAvatarDataUrl: string | undefined
      if (avatarUrlToFetch) {
        try {
          footerAvatarDataUrl = await fetchPosterDataUrl(avatarUrlToFetch)
        } catch {
          // Non-fatal: render without avatar
        }
      }

      const films = filmData.films.map((f: FilmData, i: number) => ({
        title:         f.title,
        year:          f.year,
        rating:        f.rating,
        date:          f.date,
        reviewText:    f.reviewText,
        tags:          f.tags,
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
        reviewCount: cardType === 'review' ? reviewCount : undefined,
        showListTitle:       cardType === 'list' ? showListTitle : undefined,
        showListDescription: cardType === 'list' ? showListDesc  : undefined,
        listTitle:           cardType === 'list' ? filmData.listTitle       : undefined,
        listDescription:     cardType === 'list' ? filmData.listDescription : undefined,
        showCardTypeLabel:   (cardType !== 'list' && cardType !== 'review') ? showCardTypeLabel : undefined,
        cardTypeLabel:       (cardType !== 'list' && cardType !== 'review') ? CARD_TYPE_CONFIGS[cardType].label : undefined,
        showTags:            (cardType === 'list' || cardType === 'review') ? showTags : undefined,
        listTags:            cardType === 'list' ? filmData.listTags : undefined,
        backdropDataUrl,
        footerAvatarDataUrl,
        showShareIcon: !isOwnProfile,
        layout,
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
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const buttonDisabled = status === 'loading' || isValidPage !== true

  return (
    <div className={styles.popup}>
      {status === 'loading' && <div className={styles.loadingBar} />}

      <header className={styles.header}>
        {view === 'settings' ? (
          <>
            <button className={styles.backBtn} onClick={() => setView('main')} aria-label="Back to main">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>
              Back
            </button>
            <span className={styles.settingsTitle}>Settings</span>
          </>
        ) : (
          <>
            <a
              href="https://boxd-card.michaellamb.dev"
              target="_blank"
              rel="noreferrer"
              className={styles.headerLink}
            >
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
            </a>
            <button className={styles.gearBtn} onClick={() => setView('settings')} aria-label="Settings">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </button>
          </>
        )}
      </header>

      {updateAvailable && (
        <a
          className={styles.updateBanner}
          href="https://github.com/michaellambgelo/boxd-card/releases/latest"
          target="_blank"
          rel="noreferrer"
        >
          v{updateAvailable} available — download update
        </a>
      )}

      {view === 'settings' && (
        <div className={styles.body}>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Default layout</span>
            {LAYOUTS.map(l => (
              <label key={l} className={styles.layoutOption}>
                <input
                  type="radio"
                  name="layout"
                  value={l}
                  checked={layout === l}
                  onChange={() => { setLayout(l); saveSettings({ layout: l }) }}
                />
                <span className={styles.layoutOptionText}>
                  <span>{LAYOUT_CONFIGS[l].label}</span>
                  <span className={styles.layoutOptionDesc}>{LAYOUT_CONFIGS[l].description}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {view === 'main' && (
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
                  onChange={() => { setListCount(n); saveSettings({ listCount: n }) }}
                />
                {n} films
              </label>
            ))}
          </div>
        )}

        {/* Review count selector — only on the reviews list page (single review pages always yield 1) */}
        {cardType === 'review' && isReviewListPage && (
          <div className={styles.radioGroup}>
            {([1, 2, 3, 4] as ReviewCount[]).map(n => (
              <label key={n} className={styles.checkboxLabel}>
                <input
                  type="radio"
                  name="reviewCount"
                  value={n}
                  checked={reviewCount === n}
                  onChange={() => { setReviewCount(n); saveSettings({ reviewCount: n }) }}
                />
                {n}
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

        {/* List title / description / tags / backdrop checkboxes */}
        {cardType === 'list' && (
          <div className={styles.checkboxGrid}>
            <label className={styles.checkboxLabel}>
              <input type="checkbox" checked={showListTitle} onChange={e => { setShowListTitle(e.target.checked); saveSettings({ showListTitle: e.target.checked }) }} />
              List title
            </label>
            <label className={styles.checkboxLabel}>
              <input type="checkbox" checked={showListDesc} onChange={e => { setShowListDesc(e.target.checked); saveSettings({ showListDesc: e.target.checked }) }} />
              Description
            </label>
            <label className={styles.checkboxLabel}>
              <input type="checkbox" checked={showTags} onChange={e => { setShowTags(e.target.checked); saveSettings({ showTags: e.target.checked }) }} />
              Tags
            </label>
            <label className={styles.checkboxLabel}>
              <input type="checkbox" checked={showBackdrop} onChange={e => { setShowBackdrop(e.target.checked); saveSettings({ showBackdrop: e.target.checked }) }} />
              Backdrop
            </label>
          </div>
        )}

        {/* Card type label checkbox — for non-list, non-review types */}
        {cardType !== 'list' && cardType !== 'review' && (
          <div>
            <label className={styles.checkboxLabel}>
              <input type="checkbox" checked={showCardTypeLabel} onChange={e => { setShowCardTypeLabel(e.target.checked); saveSettings({ showCardTypeLabel: e.target.checked }) }} />
              Card type label
            </label>
          </div>
        )}

        {/* Display option checkboxes */}
        <div className={styles.checkboxGrid}>
          <label className={styles.checkboxLabel}>
            <input type="checkbox" checked={showTitle} onChange={e => { setShowTitle(e.target.checked); saveSettings({ showTitle: e.target.checked }) }} />
            Film title
          </label>
          <label className={styles.checkboxLabel}>
            <input type="checkbox" checked={showYear} onChange={e => { setShowYear(e.target.checked); saveSettings({ showYear: e.target.checked }) }} disabled={!showTitle} />
            Year
          </label>
          <label className={styles.checkboxLabel}>
            <input type="checkbox" checked={showRating} onChange={e => { setShowRating(e.target.checked); saveSettings({ showRating: e.target.checked }) }} />
            Star rating
          </label>
          <label className={styles.checkboxLabel}>
            <input type="checkbox" checked={showDate} onChange={e => { setShowDate(e.target.checked); saveSettings({ showDate: e.target.checked }) }} />
            {(cardType === 'recent-diary' || cardType === 'review') ? 'Watch date' : 'Date'}
          </label>
          {cardType === 'review' && (
            <label className={styles.checkboxLabel}>
              <input type="checkbox" checked={showTags} onChange={e => { setShowTags(e.target.checked); saveSettings({ showTags: e.target.checked }) }} />
              Tags
            </label>
          )}
          {cardType === 'review' && (
            <label className={styles.checkboxLabel}>
              <input type="checkbox" checked={showBackdrop} onChange={e => { setShowBackdrop(e.target.checked); saveSettings({ showBackdrop: e.target.checked }) }} />
              Backdrop
            </label>
          )}
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
              <button className={`${styles.actionBtn}${copied ? ` ${styles.actionBtnCopied}` : ''}`} onClick={handleCopy}>
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </>
        )}
      </div>
      )}
    </div>
  )
}
