import { useState } from 'react'
import { renderCard } from '../canvas/renderCard'
import { CARD_TYPES, CARD_TYPE_CONFIGS } from '../types'
import type { CardType, ListCount, ReviewCount } from '../types'
import {
  scrapeLetterboxdPage,
  fetchImageDataUrl,
} from './webScraper'
import type { FilmData } from '../content/index'
import styles from './App.module.css'

type Status = 'idle' | 'loading' | 'ready' | 'error'

export default function App() {
  const [status,      setStatus]      = useState<Status>('idle')
  const [error,       setError]       = useState<string | null>(null)
  const [username,    setUsername]    = useState('')
  const [cardType,    setCardType]    = useState<CardType>('last-four-watched')
  const [listSlug,    setListSlug]    = useState('')
  const [listCount,   setListCount]   = useState<ListCount>(4)
  const [reviewCount, setReviewCount] = useState<ReviewCount>(1)

  const [showTitle,          setShowTitle]          = useState(true)
  const [showYear,           setShowYear]           = useState(true)
  const [showRating,         setShowRating]         = useState(true)
  const [showDate,           setShowDate]           = useState(true)
  const [showListTitle,      setShowListTitle]      = useState(true)
  const [showListDesc,       setShowListDesc]       = useState(true)
  const [showCardTypeLabel,  setShowCardTypeLabel]  = useState(true)
  const [showTags,           setShowTags]           = useState(true)
  const [showBackdrop,       setShowBackdrop]       = useState(true)

  const [cardUrl,  setCardUrl]  = useState<string | null>(null)
  const [cardBlob, setCardBlob] = useState<Blob | null>(null)
  const [copied,   setCopied]   = useState(false)

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault()

    const trimmedUsername = username.trim()
    if (!trimmedUsername) {
      setError('Enter a Letterboxd username.')
      setStatus('error')
      return
    }
    if (cardType === 'list' && !listSlug.trim()) {
      setError('Enter a list name (slug) for the List card type.')
      setStatus('error')
      return
    }

    setStatus('loading')
    setError(null)
    if (cardUrl) URL.revokeObjectURL(cardUrl)
    setCardUrl(null)
    setCardBlob(null)

    try {
      const filmData = await scrapeLetterboxdPage(
        trimmedUsername,
        cardType,
        listSlug.trim(),
        (cardType === 'list' || cardType === 'recent-diary') ? listCount : 4,
        cardType === 'review' ? reviewCount : 1,
      )

      if (!filmData.films.length) {
        throw new Error('No films found on this page. Check the username and card type.')
      }

      const posterResults = await Promise.allSettled(
        filmData.films.map((f: FilmData) => fetchImageDataUrl(f.posterUrl)),
      )
      const failedCount = posterResults.filter(r => r.status === 'rejected').length
      if (failedCount === filmData.films.length) {
        throw new Error('All poster images failed to load. The proxy may be unavailable.')
      }
      const posterDataUrls = posterResults.map(r =>
        r.status === 'fulfilled' ? r.value : '',
      )

      let backdropDataUrl: string | undefined
      if (showBackdrop && filmData.backdropUrl && (cardType === 'review' || cardType === 'list')) {
        try {
          backdropDataUrl = await fetchImageDataUrl(filmData.backdropUrl)
        } catch {
          // Non-fatal: render without backdrop
        }
      }

      const isOwnProfile = !!(
        filmData.loggedInUsername &&
        filmData.loggedInUsername.toLowerCase() === filmData.username.toLowerCase()
      )

      const avatarUrlToFetch = isOwnProfile
        ? filmData.loggedInAvatarUrl
        : filmData.authorAvatarUrl
      let footerAvatarDataUrl: string | undefined
      if (avatarUrlToFetch) {
        try {
          footerAvatarDataUrl = await fetchImageDataUrl(avatarUrlToFetch)
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
        username:            filmData.username,
        showTitle,
        showYear,
        showRating,
        showDate,
        cardType,
        listCount:           (cardType === 'list' || cardType === 'recent-diary') ? listCount : undefined,
        reviewCount:         cardType === 'review' ? reviewCount : undefined,
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
        showShareIcon:       !isOwnProfile,
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

  async function handleShare() {
    if (!cardBlob) return
    const file = new File([cardBlob], 'boxd-card.png', { type: 'image/png' })
    await navigator.share({ files: [file] })
  }

  const canShare = typeof navigator !== 'undefined' && 'share' in navigator

  return (
    <div className={styles.app}>
      {status === 'loading' && <div className={styles.loadingBar} />}

      <div className={styles.page}>
        {/* Header */}
        <header className={styles.header}>
          <a
            href="https://boxd-card.michaellamb.dev"
            className={styles.headerLink}
          >
            <svg viewBox="0 0 500 500" xmlns="http://www.w3.org/2000/svg" width="40" height="40" aria-hidden="true">
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
            <div>
              <h1>Boxd Card</h1>
              <p className={styles.headerSubtitle}>No extension needed — works on any device</p>
            </div>
          </a>
        </header>

        {/* Form */}
        <form className={styles.form} onSubmit={handleGenerate}>
          <div className={styles.fieldRow}>
            {/* Username */}
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="username">
                Letterboxd username
              </label>
              <input
                id="username"
                className={styles.input}
                type="text"
                placeholder="e.g. dave"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={username}
                onChange={e => setUsername(e.target.value)}
              />
            </div>

            {/* Card type */}
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="cardType">
                Card type
              </label>
              <select
                id="cardType"
                className={styles.select}
                value={cardType}
                onChange={e => setCardType(e.target.value as CardType)}
              >
                {CARD_TYPES.map(t => (
                  <option key={t} value={t}>
                    {CARD_TYPE_CONFIGS[t].label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* List slug — only for List type */}
          {cardType === 'list' && (
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="listSlug">
                List name (slug from the URL)
              </label>
              <input
                id="listSlug"
                className={styles.input}
                type="text"
                placeholder="e.g. my-top-horror-films"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={listSlug}
                onChange={e => setListSlug(e.target.value)}
              />
            </div>
          )}

          {/* Film count — for List and Recent Diary */}
          {(cardType === 'list' || cardType === 'recent-diary') && (
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Film count</span>
              <div className={styles.radioGroup}>
                {([4, 10, 20] as ListCount[]).map(n => (
                  <label key={n} className={styles.radioLabel}>
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
            </div>
          )}

          {/* Review count — for Review type */}
          {cardType === 'review' && (
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Review count</span>
              <div className={styles.radioGroup}>
                {([1, 2, 3, 4] as ReviewCount[]).map(n => (
                  <label key={n} className={styles.radioLabel}>
                    <input
                      type="radio"
                      name="reviewCount"
                      value={n}
                      checked={reviewCount === n}
                      onChange={() => setReviewCount(n)}
                    />
                    {n}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Display options */}
          <div className={styles.optionsSection}>
            <span className={styles.optionsSectionLabel}>Display options</span>

            {/* List-specific options */}
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
                <label className={styles.checkboxLabel}>
                  <input type="checkbox" checked={showTags} onChange={e => setShowTags(e.target.checked)} />
                  Tags
                </label>
                <label className={styles.checkboxLabel}>
                  <input type="checkbox" checked={showBackdrop} onChange={e => setShowBackdrop(e.target.checked)} />
                  Backdrop
                </label>
              </div>
            )}

            {/* Card type label — non-list, non-review types */}
            {cardType !== 'list' && cardType !== 'review' && (
              <label className={styles.checkboxLabel}>
                <input type="checkbox" checked={showCardTypeLabel} onChange={e => setShowCardTypeLabel(e.target.checked)} />
                Card type label
              </label>
            )}

            {/* Common options */}
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
                {(cardType === 'recent-diary' || cardType === 'review') ? 'Watch date' : 'Date'}
              </label>
              {cardType === 'review' && (
                <>
                  <label className={styles.checkboxLabel}>
                    <input type="checkbox" checked={showTags} onChange={e => setShowTags(e.target.checked)} />
                    Tags
                  </label>
                  <label className={styles.checkboxLabel}>
                    <input type="checkbox" checked={showBackdrop} onChange={e => setShowBackdrop(e.target.checked)} />
                    Backdrop
                  </label>
                </>
              )}
            </div>
          </div>

          <button
            type="submit"
            className={styles.generateBtn}
            disabled={status === 'loading'}
          >
            {status === 'loading' ? 'Generating…' : 'Generate Card'}
          </button>

          {(status === 'error' && error) && (
            <p className={styles.error}>{error}</p>
          )}
        </form>

        {/* Preview */}
        {status === 'ready' && cardUrl && (
          <section className={styles.previewSection}>
            <span className={styles.previewLabel}>Your card</span>
            <a href={cardUrl} target="_blank" rel="noreferrer">
              <img
                src={cardUrl}
                alt="Boxd Card preview"
                className={styles.preview}
              />
            </a>
            <div className={styles.actionRow}>
              <button className={styles.actionBtn} onClick={handleDownload}>
                Download
              </button>
              <button
                className={`${styles.actionBtn}${copied ? ` ${styles.actionBtnCopied}` : ''}`}
                onClick={handleCopy}
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
              {canShare && (
                <button className={styles.actionBtn} onClick={handleShare}>
                  Share
                </button>
              )}
            </div>
          </section>
        )}

        <footer className={styles.footer}>
          <span>
            <a href="https://boxd-card.michaellamb.dev">Boxd Card</a>
            {' · '}
            <a href="https://boxd-card.michaellamb.dev/privacy.html">Privacy</a>
          </span>
          <span>
            <a href="https://github.com/michaellambgelo/boxd-card">GitHub</a>
          </span>
        </footer>
      </div>
    </div>
  )
}
