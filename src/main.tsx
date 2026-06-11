import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

// Lock layout to the LARGEST viewport height ever observed. On Android PWA
// (especially forced-landscape), pulling the top status bar also raises the
// bottom nav bar, shrinking window.innerHeight. By only ever growing --app-h
// (never shrinking), the game stays sized to the bars-retracted height and the
// transient bars overlay the canvas instead of squishing it.
function lockAppViewport() {
  const root = document.documentElement
  const prevH = parseInt(root.style.getPropertyValue('--app-h')) || 0
  const prevW = parseInt(root.style.getPropertyValue('--app-w')) || 0
  if (window.innerHeight > prevH) root.style.setProperty('--app-h', window.innerHeight + 'px')
  if (window.innerWidth > prevW) root.style.setProperty('--app-w', window.innerWidth + 'px')
}
lockAppViewport()
window.addEventListener('resize', lockAppViewport)
// Orientation flips the long/short axis — reset and re-measure after settle.
window.addEventListener('orientationchange', () => {
  document.documentElement.style.setProperty('--app-h', '0px')
  document.documentElement.style.setProperty('--app-w', '0px')
  setTimeout(lockAppViewport, 300)
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
