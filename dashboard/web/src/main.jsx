import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// New three-page UI by default; the previous single-page dashboard stays
// reachable at /?classic as an instant fallback. Each imports its own CSS,
// so dynamic import keeps the two stylesheets from colliding.
const classic = new URLSearchParams(window.location.search).has('classic')
const load = classic ? import('./ClassicApp.jsx') : import('./App.jsx')

load.then(({ default: Root }) => {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <Root />
    </StrictMode>,
  )
})
