import { useState, useEffect } from 'react'
import { renderCard } from '../canvas/renderCard'
import { CARD_TYPE_CONFIGS, LAYOUTS, LAYOUT_CONFIGS } from '../types'
import type { CardType, ListCount, ReviewCount, Layout } from '../types'
import { loadSettings, saveSettings } from '../storage/settings'
import {
  scrapeLetterboxdPage,
  fetchImageDataUrl,
  parseLetterboxdUrl,
  resolveLetterboxdUrl,
} from './webScraper'
import type { ParsedLetterboxdUrl } from './webScraper'
import type { FilmData } from '../content/index'
import styles from './App.module.css'

type Status = 'idle' | 'loading' | 'ready' | 'error'
type View = 'main' | 'settings'

export default function App() {
  const [view,        setView]        = useState<View>('main')
  const [status,      setStatus]      = useState<Status>('idle')
  const [error,       setError]       = useState<string | null>(null)

  const [urlInput,    setUrlInput]    = useState('')
  const [detected,    setDetected]    = useState<ParsedLetterboxdUrl | null>(null)
  const [detectError, setDetectError] = useState<string | null>(null)
  const [detecting,   setDetecting]   = useState(false)

  // For profile pages where cardType is ambiguous, user picks one of these two
  const [profileCardType, setProfileCardType] = useState<'last-four-watched' | 'favorites'>('last-four-watched')

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
  const [layout,       setLayout]       = useState<Layout>('landscape')

  const [cardUrl,  setCardUrl]  = useState<string | null>(null)
  const [cardBlob, setCardBlob] = useState<Blob | null>(null)
  const [copied,   setCopied]   = useState(false)

  // On mount: load persisted settings
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
  }, [])

  // Effective card type after detection + profile-page override
  const effectiveCardType: CardType = detected
    ? (detected.cardType ?? profileCardType)
    : profileCardType

  // ── URL detection (shared by paste and generate) ─────────────────────────────

  async function detectUrl(text: string): Promise<ParsedLetterboxdUrl | null> {
    setDetected(null)
    setDetectError(null)

    const parsed = parseLetterboxdUrl(text)
    if (parsed === null) {
      setDetectError("This doesn't look like a supported Letterboxd URL. Try a profile, diary, list, reviews, or film review link.")
      return null
    }

    if (parsed.username) {
      setDetected(parsed)
      return parsed
    }

    // Short URL (boxd.it) — needs a network round-trip
    setDetecting(true)
    try {
      const resolved = await resolveLetterboxdUrl(text)
      setDetected(resolved)
      return resolved
    } catch (err) {
      setDetectError(err instanceof Error ? err.message : 'Could not resolve this URL.')
      return null
    } finally {
      setDetecting(false)
    }
  }

  async function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData('text').trim()
    if (text) await detectUrl(text)
  }

  // ── Generate ────────────────────────────────────────────────────────────────

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault()

    // If the user typed or edited the URL without pasting, detect it now
    const resolvedDetected = detected ?? await detectUrl(urlInput.trim())
    if (!resolvedDetected) return

    const resolvedCardType = resolvedDetected.cardType ?? profileCardType
    const { username, listSlug, filmSlug, isReviewListPage } = resolvedDetected

    setStatus('loading')
    setError(null)
    if (cardUrl) URL.revokeObjectURL(cardUrl)
    setCardUrl(null)
    setCardBlob(null)

    try {
      const filmData = await scrapeLetterboxdPage(
        username,
        resolvedCardType,
        listSlug,
        (resolvedCardType === 'list' || resolvedCardType === 'recent-diary') ? listCount : 4,
        (resolvedCardType === 'review' && isReviewListPage) ? reviewCount : 1,
        isReviewListPage,
        filmSlug,
      )

      if (!filmData.films.length) {
        throw new Error('No films found on this page. Check the URL and try again.')
      }

      const posterResults = await Promise.allSettled(
        filmData.films.map((f: FilmData) =>
          f.posterUrl ? fetchImageDataUrl(f.posterUrl) : Promise.reject(new Error('empty poster URL')),
        ),
      )
      const failures = posterResults.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      if (failures.length === filmData.films.length) {
        const reason = String(failures[0]?.reason ?? 'unknown')
        throw new Error(`All poster images failed to load. (${reason})`)
      }
      const posterDataUrls = posterResults.map(r =>
        r.status === 'fulfilled' ? r.value : '',
      )

      let backdropDataUrl: string | undefined
      if (showBackdrop && filmData.backdropUrl && (resolvedCardType === 'review' || resolvedCardType === 'list')) {
        try { backdropDataUrl = await fetchImageDataUrl(filmData.backdropUrl) } catch { /* non-fatal */ }
      }

      const isOwnProfile = !!(
        filmData.loggedInUsername &&
        filmData.loggedInUsername.toLowerCase() === filmData.username.toLowerCase()
      )
      const avatarUrlToFetch = isOwnProfile ? filmData.loggedInAvatarUrl : filmData.authorAvatarUrl
      let footerAvatarDataUrl: string | undefined
      if (avatarUrlToFetch) {
        try { footerAvatarDataUrl = await fetchImageDataUrl(avatarUrlToFetch) } catch { /* non-fatal */ }
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
        cardType:            resolvedCardType,
        listCount:           (resolvedCardType === 'list' || resolvedCardType === 'recent-diary') ? listCount : undefined,
        reviewCount:         resolvedCardType === 'review' ? reviewCount : undefined,
        showListTitle:       resolvedCardType === 'list' ? showListTitle : undefined,
        showListDescription: resolvedCardType === 'list' ? showListDesc  : undefined,
        listTitle:           resolvedCardType === 'list' ? filmData.listTitle       : undefined,
        listDescription:     resolvedCardType === 'list' ? filmData.listDescription : undefined,
        showCardTypeLabel:   (resolvedCardType !== 'list' && resolvedCardType !== 'review') ? showCardTypeLabel : undefined,
        cardTypeLabel:       (resolvedCardType !== 'list' && resolvedCardType !== 'review') ? CARD_TYPE_CONFIGS[resolvedCardType].label : undefined,
        showTags:            (resolvedCardType === 'list' || resolvedCardType === 'review') ? showTags : undefined,
        listTags:            resolvedCardType === 'list' ? filmData.listTags : undefined,
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

  // ── Action handlers ─────────────────────────────────────────────────────────

  function handleDownload() {
    if (!cardUrl) return
    const a = document.createElement('a')
    a.href = cardUrl
    a.download = 'boxd-card.png'
    a.click()
  }

  async function handleCopy() {
    if (!cardBlob) return
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': cardBlob })])
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  async function handleShare() {
    if (!cardBlob) return
    await navigator.share({ files: [new File([cardBlob], 'boxd-card.png', { type: 'image/png' })] })
  }

  const canShare = typeof navigator !== 'undefined' && 'share' in navigator

  // Detection hint shown below the URL field
  function detectionHint(): string | null {
    if (detecting) return 'Detecting…'
    if (!detected) return null
    const label = detected.cardType
      ? CARD_TYPE_CONFIGS[detected.cardType].label
      : 'Profile page'
    return `${label} · @${detected.username}`
  }

  const hint = detectionHint()

  return (
    <div className={styles.app}>
      {status === 'loading' && <div className={styles.loadingBar} />}

      <div className={styles.page}>
        {/* Header */}
        <header className={styles.header}>
          {view === 'settings' ? (
            <>
              <button className={styles.backBtn} onClick={() => setView('main')} aria-label="Back to main">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>
                Back
              </button>
              <span className={styles.settingsTitle}>Settings</span>
            </>
          ) : (
            <>
              <a href="https://boxd-card.michaellamb.dev" className={styles.headerLink}>
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
                <h1>Boxd Card</h1>
              </a>
              <button className={styles.gearBtn} onClick={() => setView('settings')} aria-label="Settings">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
              </button>
            </>
          )}
        </header>

        {/* Settings panel */}
        {view === 'settings' && (
          <div className={styles.settingsPanel}>
            <div className={styles.settingsSection}>
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

        {/* Form */}
        {view === 'main' && (
        <form className={styles.form} onSubmit={handleGenerate}>

          {/* URL input */}
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="lbUrl">
              Letterboxd URL
            </label>
            <input
              id="lbUrl"
              className={styles.input}
              type="url"
              inputMode="url"
              placeholder="https://letterboxd.com/username/diary/"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={urlInput}
              onPaste={handlePaste}
              onChange={e => {
                setUrlInput(e.target.value)
                if (!e.target.value.trim()) {
                  setDetected(null)
                  setDetectError(null)
                }
              }}
            />
            {hint && <p className={styles.urlHint}>{hint}</p>}
            {detectError && <p className={styles.error}>{detectError}</p>}
            <p className={styles.urlHelp}>
              Paste from Letterboxd's Share button, or enter any profile, diary, list, or reviews URL.
            </p>
          </div>

          {/* Options — shown only after a URL is successfully detected */}
          {detected && (
            <>
              {/* Profile page: choose between Last Four Watched and Favorites */}
              {detected.cardType === null && (
                <div className={styles.field}>
                  <span className={styles.fieldLabel}>Card type</span>
                  <div className={styles.radioGroup}>
                    {(['last-four-watched', 'favorites'] as const).map(t => (
                      <label key={t} className={styles.radioLabel}>
                        <input
                          type="radio"
                          name="profileCardType"
                          value={t}
                          checked={profileCardType === t}
                          onChange={() => setProfileCardType(t)}
                        />
                        {CARD_TYPE_CONFIGS[t].label}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Film count — for List and Recent Diary */}
              {(effectiveCardType === 'list' || effectiveCardType === 'recent-diary') && (
                <div className={styles.field}>
                  <span className={styles.fieldLabel}>Film count</span>
                  <div className={styles.radioGroup}>
                    {([4, 10, 20] as ListCount[]).map(n => (
                      <label key={n} className={styles.radioLabel}>
                        <input type="radio" name="listCount" value={n}
                          checked={listCount === n} onChange={() => { setListCount(n); saveSettings({ listCount: n }) }} />
                        {n} films
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Review count — only for /reviews/ list pages, not single review pages */}
              {effectiveCardType === 'review' && detected.isReviewListPage && (
                <div className={styles.field}>
                  <span className={styles.fieldLabel}>Review count</span>
                  <div className={styles.radioGroup}>
                    {([1, 2, 3, 4] as ReviewCount[]).map(n => (
                      <label key={n} className={styles.radioLabel}>
                        <input type="radio" name="reviewCount" value={n}
                          checked={reviewCount === n} onChange={() => { setReviewCount(n); saveSettings({ reviewCount: n }) }} />
                        {n}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Display options */}
              <div className={styles.optionsSection}>
                <span className={styles.optionsSectionLabel}>Display options</span>

                {effectiveCardType === 'list' && (
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

                {effectiveCardType !== 'list' && effectiveCardType !== 'review' && (
                  <label className={styles.checkboxLabel}>
                    <input type="checkbox" checked={showCardTypeLabel} onChange={e => { setShowCardTypeLabel(e.target.checked); saveSettings({ showCardTypeLabel: e.target.checked }) }} />
                    Card type label
                  </label>
                )}

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
                    {(effectiveCardType === 'recent-diary' || effectiveCardType === 'review') ? 'Watch date' : 'Date'}
                  </label>
                  {effectiveCardType === 'review' && (
                    <>
                      <label className={styles.checkboxLabel}>
                        <input type="checkbox" checked={showTags} onChange={e => { setShowTags(e.target.checked); saveSettings({ showTags: e.target.checked }) }} />
                        Tags
                      </label>
                      <label className={styles.checkboxLabel}>
                        <input type="checkbox" checked={showBackdrop} onChange={e => { setShowBackdrop(e.target.checked); saveSettings({ showBackdrop: e.target.checked }) }} />
                        Backdrop
                      </label>
                    </>
                  )}
                </div>
              </div>
            </>
          )}

          <button
            type="submit"
            className={styles.generateBtn}
            disabled={status === 'loading' || detecting || !detected}
          >
            {status === 'loading' ? 'Generating…' : 'Generate Card'}
          </button>

          {status === 'error' && error && (
            <p className={styles.error}>{error}</p>
          )}
        </form>
        )}

        {/* Preview */}
        {status === 'ready' && cardUrl && (
          <section className={styles.previewSection}>
            <span className={styles.previewLabel}>Your card</span>
            <a href={cardUrl} target="_blank" rel="noreferrer">
              <img src={cardUrl} alt="Boxd Card preview" className={styles.preview} />
            </a>
            <div className={styles.actionRow}>
              <button className={styles.actionBtn} onClick={handleDownload}>Download</button>
              <button
                className={`${styles.actionBtn}${copied ? ` ${styles.actionBtnCopied}` : ''}`}
                onClick={handleCopy}
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
              {canShare && (
                <button className={styles.actionBtn} onClick={handleShare}>Share</button>
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
