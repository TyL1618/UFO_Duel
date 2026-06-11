import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

// Lock layout to the LARGEST viewport ever observed. On Android PWA (especially
// forced-landscape), pulling the top status bar also raises the bottom nav bar,
// shrinking window.innerHeight. By only ever GROWING --app-h (never shrinking),
// the game stays sized to the bars-retracted height and the transient bars
// overlay the canvas instead of squishing it. CSS falls back to 100lvh.
function growAppViewport() {
  const root = document.documentElement
  const prevH = parseInt(root.style.getPropertyValue('--app-h')) || 0
  const prevW = parseInt(root.style.getPropertyValue('--app-w')) || 0
  if (window.innerHeight > prevH) root.style.setProperty('--app-h', window.innerHeight + 'px')
  if (window.innerWidth > prevW) root.style.setProperty('--app-w', window.innerWidth + 'px')
}
growAppViewport()
window.addEventListener('resize', growAppViewport)
// Re-measure shortly after an orientation flip (the new max may be larger), but
// never zero it out first — that caused a momentary layout collapse.
window.addEventListener('orientationchange', () => setTimeout(growAppViewport, 300))

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
