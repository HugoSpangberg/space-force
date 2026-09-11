import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './globals.css'
import { App } from './app'
import { DesignGallery } from './designs/gallery'

const root = document.querySelector<HTMLDivElement>('#root')
if (!root) throw new Error('Missing #root element')

createRoot(root).render(
  <StrictMode>
    {new URLSearchParams(window.location.search).has('designs') ? <DesignGallery /> : <App />}
  </StrictMode>,
)
