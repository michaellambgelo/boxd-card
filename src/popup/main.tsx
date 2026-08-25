import { StrictMode } from 'react'
import '../assets/fonts/fonts.css'
import { createRoot } from 'react-dom/client'
import Popup from './Popup'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Popup />
  </StrictMode>
)
