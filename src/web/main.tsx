import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { captureHandoffUrl } from './handoff'
import { initFaro, track } from './faro'

// Order matters: the landing page hands off via /app/?url=<letterboxd url>, and
// Faro stamps meta.page.url (= location.href) onto every signal. Capture and
// strip the query BEFORE Faro initializes, or the user's Letterboxd URL rides
// along on the initial page_view.
captureHandoffUrl()

initFaro()
track('page_view', { path: location.pathname, referrer: document.referrer || '' })

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
