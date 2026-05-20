import { setBufferSink } from '@/shared/logger'

setBufferSink((entry) => {
  void chrome.runtime.sendMessage({ type: 'BUFFER_LOG', entry }).catch(() => {
    // Silent: logging must never block UI or throw.
  })
})

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/global.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
