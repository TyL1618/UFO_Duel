import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

// Capture viewport once so layout doesn't reflow when Android system bars appear.
document.documentElement.style.setProperty('--app-h', window.innerHeight + 'px')
document.documentElement.style.setProperty('--app-w', window.innerWidth + 'px')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
