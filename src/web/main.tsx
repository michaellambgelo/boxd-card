import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { initFaro, track } from './faro'

initFaro()
track('page_view', { path: location.pathname, referrer: document.referrer || '' })

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
