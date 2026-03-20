import { useState } from 'react'
import type { FilmDataResponse } from '../content/index'

type Status = 'idle' | 'loading' | 'error'

export default function Popup() {
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const [showDate, setShowDate] = useState(true)

  async function handleGenerate() {
    setStatus('loading')
    setError(null)

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab.id) throw new Error('No active tab')

      const response: FilmDataResponse = await chrome.tabs.sendMessage(tab.id, {
        type: 'GET_FILM_DATA',
      })

      if (!response.films.length) {
        throw new Error('No films found. Make sure you are on a Letterboxd profile page.')
      }

      // TODO: fetch poster images via background service worker, render card
      console.log('Film data:', response)
      setStatus('idle')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus('error')
    }
  }

  return (
    <div style={{ width: 320, padding: 16, fontFamily: 'sans-serif' }}>
      <h1 style={{ fontSize: 18, margin: '0 0 12px' }}>Boxd Card</h1>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <input
          type="checkbox"
          checked={showDate}
          onChange={(e) => setShowDate(e.target.checked)}
        />
        Include date
      </label>

      <button
        onClick={handleGenerate}
        disabled={status === 'loading'}
        style={{ width: '100%', padding: '8px 0' }}
      >
        {status === 'loading' ? 'Generating…' : 'Generate Card'}
      </button>

      {error && (
        <p style={{ color: 'red', marginTop: 8, fontSize: 13 }}>{error}</p>
      )}
    </div>
  )
}
